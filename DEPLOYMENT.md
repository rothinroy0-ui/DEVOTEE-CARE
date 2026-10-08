# 🚀 Deploy to Vercel & Link Supabase Login

The portal already contains **Supabase Auth login code** (email + password, forgot/reset
password, session restore, role badges) and a serverless endpoint (`/api/config.js`) that
serves the Supabase credentials on the deployed site.

"Linking Vercel with Supabase login" = making sure the **deployed site** knows the Supabase
project **and** Supabase Auth knows the deployed site. Follow these 5 steps once.

---

## Step 1 — Give your Vercel project the Supabase credentials

1. Open [vercel.com](https://vercel.com) → your project (create/import one if it doesn't
   exist yet — Framework Preset: **Other**; root directory stays the project folder).
2. Go to **Settings → Environment Variables** and add the two variables below. You can add
   them for **Production, Preview, and Development** (or just Production to start).

   | Name | Value |
   |---|---|
   | `SUPABASE_URL` | `https://nghiqkgdrqxupxxrrlwb.supabase.co` |
   | `SUPABASE_ANON_KEY` | `sb_publishable_0l8tLvM3KaaXwpdfre-n2g_3uYUpNhy` |

   > These exact values are also in your local `.env.local`. If they ever change, update
   > **both** places (Supabase → Project Settings → API is the source of truth).

3. (Optional, automatic alternative) Vercel **Marketplace → Supabase → Add Integration**,
   link your Supabase project, and it can inject the same env vars for you.

> Why this is safe: the **anon/publishable** key is designed to be public on the client.
> `/api/config.js` reads these env vars on the server, and `.vercelignore` keeps
> `.env.local` from ever being uploaded in a drag-and-drop deploy.

---

## Step 2 — Tell Supabase Auth about your Vercel site URL

1. Open [supabase.com](https://supabase.com) → your project
   (`nghiqkgdrqxupxxrrlwb`) → **Authentication → URL Configuration**.
2. **Site URL** — set it to your live Vercel URL:
   `https://<your-project>.vercel.app` (use your custom domain if you have one).
3. **Redirect URLs** — add:
   - `https://<your-project>.vercel.app` (same as Site URL)
   - `https://<your-project>.vercel.app/**` (safety, allows sub-paths)
   - `http://localhost:8765` (so login/reset also works when testing locally)
4. Save.

> This makes the **password reset email** open correctly on your Vercel domain. When the
> user clicks the link, Supabase redirects to `https://<your-project>.vercel.app/` with a
> `#access_token=...` hash; the portal detects `type=recovery` and opens the
> "Update Password" modal automatically.

---

## Step 3 — Create the first login account

1. Supabase → **Authentication → Users → Add user**.
2. Email + password for your coordinator account.
3. (Nice-to-have) Click the user → **Edit → Raw User Metadata** and add:
   ```json
   { "full_name": "Your Name" }
   ```
   The portal shows this name in the top-right profile pill. Without it, it shows your
   email prefix. Role defaults to **Admin** so every module stays accessible —
   after enabling roles (see *Roles & Panels* below), promote this account to
   `SUPER_ADMIN` so it can manage the other logins.

---

## Step 4 — Make sure the `devotees` table exists (for live data sync)

After a successful login the portal calls `initSupabaseAndSync()` which reads the
**`devotees`** table. Login works regardless — but to get live data:

1. Supabase → **Table Editor** → check a table named `devotees` exists.
2. If it's missing, create it and map columns (`SL NO`, `DEVOTEE ID`, `NAME`, `BIRTHDAY`,
   `ANNIVERSARY`, `PHOTO`, …). The master 824 records in `devotees_data.js` are used as
   the local fallback meanwhile.

---

## Step 5 — Deploy & verify

1. Deploy the folder to Vercel (drag-and-drop the **BIRTHDAY** folder into the Vercel
   dashboard, or run `vercel --prod` from this folder if you install the CLI).
2. Check **Deployments** shows a successful build.
3. Visit your Vercel URL → you should see the **"Sign In to Portal"** screen.
4. Sign in with the account from Step 3 → the dashboard opens with your name + role badge.

---

## Roles & Panels — 🛡️ Admin Panel vs 🪷 User Panel (Phase 1)

Every login now lands in a role-based panel. The role comes from the `profiles`
table in Supabase; **until you run `supabase-auth-setup.sql` (below) every account
behaves as Admin exactly as before** — nothing breaks.

| Role | Panel | Tabs opened | Can do |
|---|---|---|---|
| `SUPER_ADMIN` / `ADMIN` | 🛡️ Admin | all 7 (incl. Settings) | everything |
| `STAFF` | 🛡️ Admin | all except Settings | edit devotees, remove/restore, parcels, export, cloud sync |
| `USER` | 🪷 User | Dashboard, Birthday, Anniversary, Parcels | view + create parcels + send wishes — main database is read-only |
| `VIEWER` | 🪷 User | all except Settings | read-only (no export, no create) |

**One-time setup (same pattern as the parcels table):**

1. Supabase → **SQL Editor → New query** → paste all of `supabase-auth-setup.sql` → **Run**.
   Creates `profiles` + signup trigger (new users always start as `USER`) + Row Level
   Security so roles can't be edited from the browser.
2. In that file, **edit the email in section 5** and re-run it to promote yourself to
   `SUPER_ADMIN`.
3. Add further logins via **Authentication → Users → Add user** (they get `USER`/🪷
   automatically). Promote anyone with:
   `update public.profiles set role='STAFF' where email='...';`

Blocked actions don't fail silently — they show a red toast
*"⛔ Permission denied — … cannot … Ask an Admin."* and the nav hides tabs the role
cannot open.

---

## 🔧 Troubleshooting

| Symptom | Fix |
|---|---|
| "Invalid email or password" | Check the user exists in Supabase **Authentication → Users** and the password is correct. |
| "Email not confirmed" | In Supabase **Users**, the row shows *Not confirmed* — confirm it, or re-create the user. |
| "Redirect URL is not allowed" | Step 2: your exact Vercel URL must be in **Redirect URLs**. |
| Password reset email link fails to open | Confirm Site URL/Redirect URLs (Step 2) and that the deployed version includes the latest code. |
| Login works but no live devotee data | The `devotees` table in Supabase (Step 4) is empty/missing — local master data is used as fallback. |
| Stuck on an old version | Redeploy after changes — the sidebar footer shows the build. Force refresh (Ctrl+F5) once. |

---

*Dedicated to the loving service of the Vaishnavas and His Divine Grace A.C. Bhaktivedanta Swami Prabhupada.*