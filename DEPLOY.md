# PRODTRACK — Layer 1 Deployment Guide

This gets a **working, data-backed PRODTRACK** running on your IONOS VPS:
login screen, real user accounts with roles, and Work Orders that persist
to PostgreSQL. Everything else (WI library, QMS, DOA/DAS) comes in Layers 2–3
on this same foundation.

Golden rule from before: **if your prompt starts with `root@` or `ricardo@`
you're on the server; if it starts with `PS C:\` you're on Windows.**
Every command below runs **on the server** unless it says otherwise.

---

## Step 0 — Get the files onto the server

On your **Windows** machine, from the folder where you saved `prodtrack-backend`,
copy it to the server (replace with your user and IP):

```
scp -r prodtrack-backend ricardo@YOUR_SERVER_IP:~/
```

Then connect and enter the folder:

```
ssh ricardo@YOUR_SERVER_IP
cd ~/prodtrack-backend
```

> If you're using Claude Code on your desktop, you can skip scp — just tell it
> to deploy the `prodtrack-backend` folder to your VPS and it handles the transfer.

---

## Step 1 — Install the app's dependencies

```
npm install
```

This reads `package.json` and downloads Express, the PostgreSQL driver, etc.
Takes a minute. A few "warn" lines are normal; "error" lines are not.

---

## Step 2 — Create your real configuration (.env)

Copy the template and open it in the nano editor:

```
cp .env.example .env
nano .env
```

Fill in:
- `DB_PASSWORD` — the **exact** password you set for `prodtrack_app` in Phase 5.
- `JWT_SECRET` — generate a random one. Open a **second** terminal (or do it
  first): run `openssl rand -hex 48`, copy the output, paste it here.

Leave `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `PORT` as they are.
Save in nano with **Ctrl+O, Enter**, then exit with **Ctrl+X**.

Lock the file down so only you can read it:

```
chmod 600 .env
```

---

## Step 3 — Build the database tables

```
npm run init-db
```

Expected output: `✓ Schema applied successfully.`

If you instead see `password authentication failed` — the `DB_PASSWORD` in
`.env` doesn't match what you set in Phase 5. Re-open `.env` and fix it.

---

## Step 4 — Create the starter accounts + load work orders

Choose passwords for the four starter accounts and pass them in on the command
line (this way they never get written into any file). Replace the example
passwords with strong ones you choose:

```
SEED_ADMIN_PW='choose-admin-pw' \
SEED_ENGINEER_PW='choose-engineer-pw' \
SEED_QUALITY_PW='choose-quality-pw' \
SEED_OPERATOR_PW='choose-operator-pw' \
npm run seed
```

Expected output lists each user "ready" and "Seeded 6 work orders."
Write these four passwords into your password manager now.

---

## Step 5 — Test it runs

```
npm start
```

You should see: `PRODTRACK backend listening on 127.0.0.1:3001`.

Leave it running and open a **second** terminal on the server to test the
health check:

```
curl http://127.0.0.1:3001/api/health
```

Expected: `{"status":"ok","db":"connected"}`

Press **Ctrl+C** in the first terminal to stop it for now.

---

## Step 6 — Keep it running with PM2

So the app survives crashes and reboots:

```
pm2 start server.js --name prodtrack
pm2 save
pm2 startup
```

The `pm2 startup` command prints one line starting with `sudo env ...` —
**copy that exact line, paste it, and run it.** That's what makes PRODTRACK
start automatically when the server reboots.

Check it's alive:

```
pm2 status
```

`prodtrack` should show status **online**.

---

## Step 7 — Point your domain at the app (Nginx)

You already have Nginx + HTTPS from Phase 7. Now we tell Nginx to hand
`prodtrack.infurci.com` traffic to the Node app.

Copy the provided config into place:

```
sudo cp deploy/nginx-prodtrack.conf /etc/nginx/sites-available/prodtrack
sudo ln -s /etc/nginx/sites-available/prodtrack /etc/nginx/sites-enabled/prodtrack
```

Test the config and reload:

```
sudo nginx -t
sudo systemctl reload nginx
```

`sudo nginx -t` must say "syntax is ok" and "test is successful".

**HTTPS:** if you haven't yet issued a certificate for this exact subdomain,
run:

```
sudo certbot --nginx -d prodtrack.infurci.com
```

Certbot edits the config to add the certificate and the HTTP→HTTPS redirect.
(If Phase 7 already covered this subdomain, certbot will say the cert exists —
that's fine.)

> **DNS reminder:** `prodtrack.infurci.com` must have an **A record** pointing
> to your server IP in your domain's DNS settings. If the page doesn't load,
> this is the first thing to check — DNS can take a little while to propagate.

---

## Step 8 — Log in!

Open a browser on your laptop and go to:

```
https://prodtrack.infurci.com
```

You should see the PRODTRACK login screen. Sign in as `engineer` with the
password you chose in Step 4.

**The proof it all works:** create a new Work Order, then press **Ctrl+Shift+R**
(hard refresh). If the work order is still there after the refresh, the full
pipeline — browser → API → PostgreSQL → back — is working. 🎉

---

## The four commands you'll use to check health

| Question | Command |
|---|---|
| Is the app running? | `pm2 status` |
| What is the app saying / what error? | `pm2 logs prodtrack` |
| Is Nginx up? | `sudo systemctl status nginx` |
| Is the database up? | `sudo systemctl status postgresql` |

To restart the app after any change: `pm2 restart prodtrack`

---

## If something doesn't work

Don't guess — grab the evidence and send it to me:

1. `pm2 logs prodtrack --lines 40` — copy the last chunk, especially any red text.
2. Tell me which step number you were on and what you expected vs. what happened.

Almost every first-deploy issue is one of: wrong `DB_PASSWORD` in `.env`,
DNS not pointed at the server yet, or forgetting to run `pm2 restart` after
an edit. All quick fixes.
