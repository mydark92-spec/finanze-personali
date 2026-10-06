# Le mie finanze

Piccola app personale per registrare entrate e uscite, seguire un budget mensile e ricordare bollette e scadenze.

## Uso

Apri `index.html` in un browser moderno. L'app non richiede installazione né un server; per le notifiche del browser e' consigliato servirla da `localhost` o da GitHub Pages via HTTPS.

## Pubblicare con GitHub Pages

1. Crea un repository GitHub e carica `index.html` e questo README nella cartella principale.
2. Nel repository apri **Settings → Pages**.
3. In **Build and deployment**, seleziona **Deploy from a branch**, il branch `main` e la cartella `/ (root)`, quindi salva.
4. Apri l'indirizzo Pages mostrato nella stessa pagina anche dal telefono.

## Dati e privacy

Movimenti, budget e promemoria sono salvati in `localStorage` nel browser del dispositivo. Non sono inclusi nel repository e non si sincronizzano automaticamente fra computer e telefono. Usa **Esporta dati CSV** per conservare una copia. Non inserire credenziali bancarie o dati di carte.

Le notifiche sono locali al browser: occorre concedere il permesso e lasciare l'app aperta affinche' possa controllare le scadenze.
