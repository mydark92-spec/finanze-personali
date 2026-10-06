import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

type DueReminder = {
  reminder_id: string;
  owner_id: string;
  reminder_title: string;
  reminder_due_at: string;
  reminder_amount: number | null;
};

type PushSubscriptionRow = {
  id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
};

const requiredEnv = (name: string): string => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
};

Deno.serve(async request => {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const supabaseUrl = requiredEnv("SUPABASE_URL");
    const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    const vapidPublicKey = requiredEnv("VAPID_PUBLIC_KEY");
    const vapidPrivateKey = requiredEnv("VAPID_PRIVATE_KEY");
    const vapidSubject = Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@example.com";

    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
    const { data: reminders, error: claimError } = await admin
      .rpc("claim_due_reminders", { batch_size: 100 });

    if (claimError) throw claimError;

    let delivered = 0;
    let retried = 0;
    let removedSubscriptions = 0;

    for (const reminder of (reminders ?? []) as DueReminder[]) {
      const { data: subscriptions, error: subscriptionError } = await admin
        .from("push_subscriptions")
        .select("id,endpoint,p256dh,auth")
        .eq("user_id", reminder.owner_id);

      if (subscriptionError) {
        console.error("Could not load push subscriptions for a due reminder.", subscriptionError);
        await admin.from("reminders").update({ claimed_at: null }).eq("id", reminder.reminder_id);
        retried++;
        continue;
      }

      let sent = 0;
      const payload = JSON.stringify({
        title: "Promemoria — Le mie finanze",
        body: `${reminder.reminder_title}${reminder.reminder_amount
          ? ` · € ${Number(reminder.reminder_amount).toFixed(2)}`
          : ""}`,
        tag: reminder.reminder_id,
        url: "./"
      });

      for (const subscription of (subscriptions ?? []) as PushSubscriptionRow[]) {
        try {
          await webpush.sendNotification({
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth }
          }, payload, { TTL: 60 * 60 * 24 });
          sent++;
          delivered++;
        } catch (error) {
          const statusCode = (error as { statusCode?: number }).statusCode;
          if (statusCode === 404 || statusCode === 410) {
            const { error: deleteError } = await admin
              .from("push_subscriptions")
              .delete()
              .eq("id", subscription.id);
            if (deleteError) console.error("Could not remove an expired push subscription.", deleteError);
            else removedSubscriptions++;
          } else {
            console.error("Push delivery failed for a reminder.", error);
          }
        }
      }

      if (sent > 0) {
        const { error: markError } = await admin.from("reminders")
          .update({ notified_at: new Date().toISOString(), claimed_at: null })
          .eq("id", reminder.reminder_id);
        if (markError) {
          console.error("Could not mark a delivered reminder as notified.", markError);
          retried++;
        }
      } else {
        const { error: releaseError } = await admin.from("reminders")
          .update({ claimed_at: null })
          .eq("id", reminder.reminder_id);
        if (releaseError) console.error("Could not release a reminder claim.", releaseError);
        retried++;
      }
    }

    return Response.json({ processed: reminders?.length ?? 0, delivered, retried, removedSubscriptions });
  } catch (error) {
    console.error("Scheduled push job failed.", error);
    return Response.json({ error: "Scheduled push job failed." }, { status: 500 });
  }
});
