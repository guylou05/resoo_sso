
# Memberstack + Microsoft Entra — Plan A (Browser Session via Token)
After Microsoft OIDC, server upserts the Member and creates a short-lived login token. The callback serves a tiny HTML bridge that runs `ms.loginWithToken(token)` and then redirects to `APP_BASE_URL + POST_LOGIN_PATH`.

## Env
APP_BASE_URL=https://your-domain.tld
POST_LOGIN_PATH=/membership/home
IDP_REDIRECT_URI=https://your-domain.tld/auth/callback
IDP_DISCOVERY_URL=https://login.microsoftonline.com/common/v2.0/.well-known/openid-configuration
IDP_CLIENT_ID=...
IDP_CLIENT_SECRET=...
IDP_SCOPE=openid profile email
COOKIE_SECRET=...
MEMBERSTACK_SECRET_KEY=sk_...
MEMBERSTACK_API_BASE=https://admin.memberstack.com
MEMBERSTACK_DEFAULT_FREE_PLAN=pln_xxx  # optional
