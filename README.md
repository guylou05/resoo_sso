# Memberstack + Microsoft Entra Only — Render Deployment

This is a **Render-ready** Node/Express server that performs Microsoft Entra (Azure AD) **OIDC (Auth Code + PKCE)** login, then **creates/updates a Memberstack member** via the **Admin REST API**.

## One-time Setup on Microsoft Entra (Azure AD)
1. Register an app
   - Supported accounts: **multi-tenant** (use `common` for personal + work/school).
   - Redirect URI (Web): `https://<your-render-service>.onrender.com/auth/callback` (add localhost during local dev).
2. Token configuration → Optional claims: add `email`, `given_name`, `family_name` (and rely on `preferred_username` fallback).
3. Create a **Client secret** (copy the value).
4. Scopes: `openid profile email`.

## Deploy to Render (Free)
### Option A: Click-to-deploy with `render.yaml`
- Push this folder to GitHub.
- In Render → **New +** → **Blueprint** → point to your repo.
- Render will read `render.yaml`, install, and start the service.
- After deploy, set these env vars (if not configured at creation time):
  - `IDP_CLIENT_ID`, `IDP_CLIENT_SECRET`
  - `IDP_REDIRECT_URI` → `https://<service>.onrender.com/auth/callback`
  - `APP_BASE_URL` → `https://<service>.onrender.com`
  - `COOKIE_SECRET` → long random string
  - `MEMBERSTACK_SECRET_KEY` → from Memberstack Dev Tools → API Keys

### Option B: Manual Web Service
- New Web Service → connect repo → Environment **Node**.
- Build command: `npm install && npm run build`
- Start command: `npm start`
- Add the same environment variables as above.

## Local Dev
```
cp .env.example .env
npm install
npm run dev
```
Visit `http://localhost:3000` and click **Continue with Microsoft**.

## After Deploy
- Update your **Entra Redirect URI** to the Render URL `/auth/callback`.
- Test with a personal @outlook.com and a work/school account.
- Verify Memberstack member appears/updates in your workspace.

## Files
- `server.js` — routes (`/auth/login`, `/auth/callback`, `/api/me`, `/logout`).
- `auth-helpers.js` — PKCE, discovery, token exchange, JOSE verification, profile normalization.
- `memberstack.js` — Memberstack Admin REST wrapper.
- `public/` — static pages.
- `render.yaml` — blueprint for Render.
- `Procfile` — optional; Render uses `start` by default.

## Security
- httpOnly signed cookies, `SameSite=Lax`, `Secure` in production.
- Validates ID token `iss`, `aud`, `exp`, **nonce**; uses **PKCE** and **state**.
- Never expose `MEMBERSTACK_SECRET_KEY` to the client.

MIT
