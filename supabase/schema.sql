create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault with schema vault;

create table if not exists public.reminders (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  due_at timestamptz not null,
  amount numeric(12, 2) check (amount is null or amount > 0),
  notified_at timestamptz,
  claimed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists reminders_due_idx
  on public.reminders (due_at)
  where notified_at is null;

create table if not exists public.push_subscriptions (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  check (
    endpoint like 'https://fcm.googleapis.com/%'
    or endpoint like 'https://web.push.apple.com/%'
  ),
  unique (user_id, endpoint)
);

alter table public.reminders enable row level security;
alter table public.push_subscriptions enable row level security;
grant select, insert, update, delete on public.reminders, public.push_subscriptions to authenticated;

drop policy if exists "Owners manage their reminders" on public.reminders;
create policy "Owners manage their reminders"
  on public.reminders for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Owners manage their push subscriptions" on public.push_subscriptions;
create policy "Owners manage their push subscriptions"
  on public.push_subscriptions for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create or replace function public.claim_due_reminders(batch_size integer default 100)
returns table (
  reminder_id uuid,
  owner_id uuid,
  reminder_title text,
  reminder_due_at timestamptz,
  reminder_amount numeric
)
language sql
security definer
set search_path = ''
as $$
  with due as (
    select r.id
    from public.reminders as r
    where r.notified_at is null
      and r.due_at <= now()
      and (r.claimed_at is null or r.claimed_at < now() - interval '10 minutes')
    order by r.due_at
    limit greatest(1, least(batch_size, 200))
    for update skip locked
  ),
  claimed as (
    update public.reminders as r
    set claimed_at = now()
    from due
    where r.id = due.id
    returning r.id, r.user_id, r.title, r.due_at, r.amount
  )
  select claimed.id, claimed.user_id, claimed.title, claimed.due_at, claimed.amount
  from claimed;
$$;

revoke all on function public.claim_due_reminders(integer) from public, anon, authenticated;
grant execute on function public.claim_due_reminders(integer) to service_role;

create or replace function public.schedule_reminder_push_job()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_job bigint;
  scheduled_job bigint;
begin
  select jobid into existing_job
  from cron.job
  where jobname = 'send-finance-reminders';

  if existing_job is not null then
    perform cron.unschedule(existing_job);
  end if;

  select cron.schedule(
    'send-finance-reminders',
    '* * * * *',
    $job$
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
          || '/functions/v1/send-reminders',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'),
          'Content-Type', 'application/json'
        ),
        body := '{}'::jsonb
      );
    $job$
  ) into scheduled_job;

  return scheduled_job;
end;
$$;

revoke all on function public.schedule_reminder_push_job() from public, anon, authenticated;
grant execute on function public.schedule_reminder_push_job() to service_role;
