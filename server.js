import "dotenv/config";
import express from "express";
import cookieParser from "cookie-parser";
import path from "path";
import { fileURLToPath } from "url";

import {
generateCodeVerifier,
generateCodeChallenge,
randomString,
getDiscovery,
buildAuthorizeUrl,
exchangeCodeForTokens,
verifyIdToken,
toNormalizedProfile,
} from “./auth-helpers.js”;

import {
getMemberByEmail,
createMember,
updateMember,
createSessionToken,
createMagicLink,
} from “./memberstack.js”;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.set(“trust proxy”, 1);
app.use(cookieParser(process.env.COOKIE_SECRET || “dev_secret”));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, “public”)));

const COOKIE_FLAGS = {
httpOnly: true,
secure: process.env.NODE_ENV === “production”,
sameSite: “lax”,
signed: true,
};

const OIDC_TEMP_COOKIE = “oidc_tmp”;

/** (Optional) quick home for testing */
app.get(”/”, (req, res) => {
res.status(200).send(”<h1>OK</h1><p><a href='/auth/login'>Continue with Microsoft</a></p>”);
});

/** (Optional) inspect app session */
app.get(”/api/me”, (req, res) => {
const sessRaw = req.signedCookies[process.env.SESSION_COOKIE_NAME || “app_session”];
if (!sessRaw) return res.status(401).json({ error: “not_authenticated” });
try {
const sess = JSON.parse(sessRaw);
return res.json({ user: sess });
} catch {
return res.status(401).json({ error: “invalid_session” });
}
});

app.get(”/auth/login”, async (req, res) => {
try {
const discovery = await getDiscovery(process.env.IDP_DISCOVERY_URL);

```
const allowed = new Set(["/", "/dashboard", "/membership/home", "/app"]);
const rt = allowed.has(req.query.returnTo)
  ? req.query.returnTo
  : process.env.POST_LOGIN_PATH || "/membership/home";

const state = randomString(24);
const nonce = randomString(24);
const code_verifier = generateCodeVerifier();
const code_challenge = await generateCodeChallenge(code_verifier);

const tmp = { state, nonce, code_verifier, createdAt: Date.now(), returnTo: rt };
res.cookie(OIDC_TEMP_COOKIE, JSON.stringify(tmp), { ...COOKIE_FLAGS, maxAge: 5 * 60 * 1000 });

const authorizeUrl = buildAuthorizeUrl({
  authorization_endpoint: discovery.authorization_endpoint,
  client_id: process.env.IDP_CLIENT_ID,
  redirect_uri: process.env.IDP_REDIRECT_URI,
  scope: process.env.IDP_SCOPE || "openid profile email",
  state,
  nonce,
  code_challenge,
});

console.log("Authorize URL:", authorizeUrl);
return res.redirect(authorizeUrl);
```

} catch (e) {
console.error(“Login init error:”, e);
return res.status(500).send(`<pre>Login init failed:\n${e?.message || e}</pre>`);
}
});

app.get(”/auth/callback”, async (req, res) => {
try {
const { code, state } = req.query;
if (!code || !state) return res.status(400).send(“Missing code/state”);

```
const tmpRaw = req.signedCookies[OIDC_TEMP_COOKIE];
if (!tmpRaw) return res.status(400).send("Auth flow expired");
const tmp = JSON.parse(tmpRaw);
res.clearCookie(OIDC_TEMP_COOKIE, COOKIE_FLAGS);
if (state !== tmp.state) return res.status(400).send("State mismatch");

const discovery = await getDiscovery(process.env.IDP_DISCOVERY_URL);
const tokens = await exchangeCodeForTokens({
  token_endpoint: discovery.token_endpoint,
  client_id: process.env.IDP_CLIENT_ID,
  client_secret: process.env.IDP_CLIENT_SECRET,
  code,
  redirect_uri: process.env.IDP_REDIRECT_URI,
  code_verifier: tmp.code_verifier,
});

const idPayload = await verifyIdToken({
  id_token: tokens.id_token,
  audience: process.env.IDP_CLIENT_ID,
  jwks_uri: discovery.jwks_uri,
  expectedNonce: tmp.nonce,
});

const profile = toNormalizedProfile(idPayload);
if (!profile.email) return res.status(400).send("No email claim present for this account.");

// ===== Upsert Member (writes native + your custom fields: first-name, last-name) =====
const desiredFirst = (profile.given_name || "").trim();
const desiredLast  = (profile.family_name || "").trim();

let member = await getMemberByEmail(profile.email);

if (!member) {
  const plan = process.env.MEMBERSTACK_DEFAULT_FREE_PLAN || "";
  member = await createMember({
    email: profile.email,
    firstName: desiredFirst,  // native (harmless if ignored in your workspace)
    lastName:  desiredLast,   // native
    planId: plan || undefined,
    json: { idp_sub: profile.sub, name: profile.name },
    customFields: { "first-name": desiredFirst, "last-name": desiredLast },
  });
} else {
  const cf = member.customFields ?? member.custom_fields ?? {};
  const updates = {
    // update custom fields (primary for your project)
    customFields: { ...cf, "first-name": desiredFirst, "last-name": desiredLast },
  };
  // optionally mirror into native fields
  const currentFirstNative = member.firstName ?? member.first_name ?? "";
  const currentLastNative  = member.lastName  ?? member.last_name  ?? "";
  if (desiredFirst && desiredFirst !== currentFirstNative) updates.firstName = desiredFirst;
  if (desiredLast  && desiredLast  !== currentLastNative)  updates.lastName  = desiredLast;

  member = await updateMember(member.id, updates);
}

// ===== Optional backend session cookie =====
const session = { email: profile.email, sub: profile.sub, memberId: member?.id || null, ts: Date.now() };
res.cookie(process.env.SESSION_COOKIE_NAME || "app_session", JSON.stringify(session), {
  ...COOKIE_FLAGS, maxAge: 7 * 24 * 60 * 60 * 1000,
});

// ===== Finish: TOKEN LOGIN ONLY =====
const finalDest = `${process.env.APP_BASE_URL || ""}${tmp.returnTo || (process.env.POST_LOGIN_PATH || "/membership/home")}`;

// Try to get session token
let tokenRes = await createSessionToken(member.id);
if (tokenRes?.token) {
  const escapedToken = JSON.stringify(tokenRes.token).replace(/</g, "\\u003c");
  const escapedDest  = JSON.stringify(finalDest).replace(/</g, "\\u003c");
  return res.status(200).send(`<!doctype html>
```

<meta charset="utf-8"><title>Signing you in…</title>

<script data-memberstack-app="app_clddpivji00150ulqcesy3zo7" src="https://static.memberstack.com/scripts/v1/memberstack.js" async></script>

<p style="font-family:system-ui,Segoe UI,Arial;margin:2rem;">Finalizing your login...</p>
<script>
  function sleep(ms){ return new Promise(r=>setTimeout(r, ms)); }
  async function ensureSession(ms, token, totalMs = 15000){
    try { 
      if (ms?.loginWithToken) {
        const result = await ms.loginWithToken(token);
        console.log("loginWithToken result:", result);
      }
    } catch(e){
      console.error("loginWithToken error:", e);
    }
    const start = Date.now();
    while (Date.now() - start < totalMs) {
      try { 
        const m = await ms.getCurrentMember(); 
        if (m) {
          console.log("Member found:", m);
          return m;
        }
      } catch(e){
        console.warn("getCurrentMember error:", e);
      }
      await sleep(500);
    }
    console.error("Session timeout - no member found");
    return null;
  }
  (async () => {
    try {
      console.log("Waiting for Memberstack...");
      const ms = (window.MemberStack && (await window.MemberStack.onReady)) || null;
      if (!ms) {
        console.error("Memberstack failed to load");
        return;
      }
      console.log("Memberstack ready, attempting login...");
      const member = await ensureSession(ms, ${escapedToken});
      if (member) {
        console.log("Login successful, redirecting...");
        window.location.replace(${escapedDest});
      } else {
        console.error("Login failed - no member session");
        document.body.innerHTML = '<h1>Login failed</h1><p>Please check console for errors.</p>';
        setTimeout(()=>window.location.replace(${escapedDest}), 5000);
      }
    } catch (error) {
      console.error("Login process error:", error);
    }
  })();
</script>`);
    }

```
// 3) Last resort: plain redirect
console.warn("[MS] no magic link or token; plain redirect");
return res.redirect(finalDest);
```

} catch (e) {
console.error(“Callback error:”, e);
return res.status(500).send(`<pre style="white-space:pre-wrap;font-family:system-ui"> Callback failed: ${e?.message || String(e)} </pre>`);
}
});

app.get(”/logout”, (req, res) => {
res.clearCookie(process.env.SESSION_COOKIE_NAME || “app_session”, COOKIE_FLAGS);
res.redirect(”/”);
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(“Listening on port”, port));