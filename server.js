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
} from "./auth-helpers.js";

import {
  getMemberByEmail,
  createMember,
  updateMember,
  createSessionToken,
  createMagicLink,
} from "./memberstack.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.set("trust proxy", 1);
app.use(cookieParser(process.env.COOKIE_SECRET || "dev_secret"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

const COOKIE_FLAGS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  signed: true,
};

const OIDC_TEMP_COOKIE = "oidc_tmp";

app.get("/auth/callback", async (req, res) => {
  try {
    const { code, state } = req.query;
    const tmpRaw = req.signedCookies[OIDC_TEMP_COOKIE];
    if (!tmpRaw) return res.status(400).send("Auth flow expired");
    const tmp = JSON.parse(tmpRaw);
    res.clearCookie(OIDC_TEMP_COOKIE, COOKIE_FLAGS);

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
    const desiredFirst = (profile.given_name || "").trim();
    const desiredLast = (profile.family_name || "").trim();

    let member = await getMemberByEmail(profile.email);
    if (!member) {
      member = await createMember({
        email: profile.email,
        firstName: desiredFirst,
        lastName: desiredLast,
        customFields: { "first-name": desiredFirst, "last-name": desiredLast },
      });
    } else {
      const cf = member.customFields ?? {};
      const updates = { customFields: { ...cf, "first-name": desiredFirst, "last-name": desiredLast } };
      member = await updateMember(member.id, updates);
    }

    const finalDest = `${process.env.APP_BASE_URL || ""}${tmp.returnTo || (process.env.POST_LOGIN_PATH || "/membership/home")}`;
    let tokenRes = await createSessionToken(member.id);

    if (tokenRes?.token) {
      const escapedToken = JSON.stringify(tokenRes.token).replace(/</g, "\\u003c");
      const escapedDest = JSON.stringify(finalDest).replace(/</g, "\\u003c");
      return res.status(200).send(`<!doctype html>
<meta charset="utf-8"><title>Signing you in…</title>
<script>
  window.memberstackConfig = { useCookies: true, setCookieOnRootDomain: true };
</script>
<script data-memberstack-app="YOUR_PUBLIC_KEY_HERE" src="https://static.memberstack.com/scripts/v1/memberstack.js" async></script>
<p>Finalizing login…</p>
<script>
  function sleep(ms){ return new Promise(r=>setTimeout(r, ms)); }
  async function ensureSession(ms, token, totalMs = 9000){
    try { if(ms?.loginWithToken) await ms.loginWithToken(token); } catch(e){}
    const start = Date.now();
    while(Date.now()-start < totalMs){
      try{
        const m = await ms.getCurrentMember();
        if(m) return m;
      }catch(e){}
      await sleep(300);
    }
    return null;
  }
  (async () => {
    const ms = (window.MemberStack && (await window.MemberStack.onReady)) || null;
    const member = ms && (await ensureSession(ms, ${escapedToken}));
    if(member){ window.location.replace(${escapedDest}); }
    else{
      document.body.innerHTML = '<h1>We couldn’t finalize your login</h1><p>Check domain config and keys.</p>';
      setTimeout(()=>window.location.replace(${escapedDest}), 3000);
    }
  })();
</script>`);
    }

    const magic = await createMagicLink(member.id, finalDest);
    if (magic?.url) return res.redirect(magic.url);
    return res.redirect(finalDest);

  } catch (e) {
    return res.status(500).send(`Callback failed: ${e?.message}`);
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log("Listening on port", port));
