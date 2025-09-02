
# Memberstack + Microsoft Entra — Render (Redirect Flow Only)
Pure redirect (no popups). Click a button → /auth/login → Microsoft → /auth/callback → server verifies + upserts Memberstack → /dashboard.

## Env (Render)
APP_BASE_URL=https://<service>.onrender.com
IDP_REDIRECT_URI=https://<service>.onrender.com/auth/callback
IDP_DISCOVERY_URL=https://login.microsoftonline.com/common/v2.0/.well-known/openid-configuration
IDP_CLIENT_ID=<id>
IDP_CLIENT_SECRET=<secret VALUE>
IDP_SCOPE=openid profile email
COOKIE_SECRET=<random>
MEMBERSTACK_SECRET_KEY=sk_sb_...
MEMBERSTACK_API_BASE=https://admin.memberstack.com
