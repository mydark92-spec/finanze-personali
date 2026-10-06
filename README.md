# Le mie finanze

App personale installabile per registrare entrate e uscite, seguire il budget e ricevere promemoria push su Android e iPhone. E' separata dal Circolo Tennis Villanova.

## Installazione sul telefono

1. Apri [Le mie finanze](https://mydark92-spec.github.io/finanze-personali/) sul telefono.
2. **Android:** apri il menu di Chrome e scegli **Installa app** o **Aggiungi a schermata Home**.
3. **iPhone:** apri il sito con Safari, tocca **Condividi → Aggiungi alla schermata Home**, poi avvia l'app dalla nuova icona. Le notifiche Web Push su iPhone richiedono iOS/iPadOS 16.4 o successivo e l'app installata sulla schermata Home.
4. Nell'app, tocca **Attiva** nella sezione Promemoria e consenti le notifiche.

Le notifiche push richiedono di completare la configurazione Supabase sotto. Fino ad allora il sito e' pubblicato, ma gli avvisi a pagina chiusa non sono attivi.

## Configurazione push (una tantum)

I promemoria online contengono solo titolo, data, ora e importo facoltativo. Entrate, uscite e budget rimangono nel browser e non vengono inviati a Supabase. Ogni dispositivo ha il proprio archivio anonimo: crea il promemoria sul telefono sul quale vuoi ricevere la notifica. I promemoria non vengono condivisi tra dispositivi.

1. Crea un progetto Supabase e abilita l'accesso anonimo in **Authentication → Sign In / Providers → Anonymous Sign-Ins**.
2. In **SQL Editor**, esegui il contenuto di [`supabase/schema.sql`](./supabase/schema.sql).
3. Genera una coppia di chiavi VAPID con `npx web-push generate-vapid-keys`. Conserva privata la chiave privata.
4. Dalla cartella del progetto, installa il [Supabase CLI](https://supabase.com/docs/guides/cli) e pubblica la funzione:

   ```text
   supabase login
   supabase link --project-ref IL_TUO_PROJECT_REF
   supabase functions deploy send-reminders
   supabase secrets set VAPID_PUBLIC_KEY=CHIAVE_PUBBLICA VAPID_PRIVATE_KEY=CHIAVE_PRIVATA VAPID_SUBJECT=mailto:LA_TUA_EMAIL
   ```

   `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` sono disponibili automaticamente nell'ambiente delle Edge Functions.
5. Nell'SQL Editor, sostituisci i due valori segnaposto ed esegui:

   ```sql
   select vault.create_secret('https://IL_TUO_PROJECT_REF.supabase.co', 'project_url');
   select vault.create_secret('LA_TUA_SERVICE_ROLE_KEY', 'service_role_key');
   select public.schedule_reminder_push_job();
   ```

   La chiave `service_role` va inserita solo in Supabase Vault, mai in `config.js` o nel repository.
6. Inserisci in [`config.js`](./config.js) l'URL del progetto, la chiave **publishable/anon** e la **chiave pubblica VAPID**; poi carica il file aggiornato su GitHub. Queste tre chiavi pubbliche possono stare nel frontend; non inserirvi mai la chiave privata VAPID o quella `service_role`.
7. Ricarica il sito sul telefono, installalo/aprilo dalla schermata Home se necessario, quindi abilita le notifiche push.

Supabase controlla le scadenze ogni minuto. La consegna dipende anche dal permesso di notifica del telefono e dalla connessione al servizio push del sistema.

## Funzioni e dati

- Entrate e uscite con categorie, date, filtri, riepilogo mensile e grafico.
- Budget mensile modificabile e salvataggio CSV dei movimenti.
- Promemoria con importo facoltativo, salvati online per la consegna push.
- I dati sono personali: non inserire password bancarie o numeri di carte.
