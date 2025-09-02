
import "dotenv/config";
import express from "express";
import cookieParser from "cookie-parser";
import path from "path";
import { fileURLToPath } from "url";

import { generateCodeVerifier, generateCodeChallenge, randomString, getDiscovery, buildAuthorizeUrl, exchangeCodeForTokens, verifyIdToken, toNormalizedProfile } from "./auth-helpers.js";
import { getMemberByEmail, createMember, updateMember, createSessionToken, createMagicLink } from "./memberstack.js";

const __filename=fileURLToPath(import.meta.url); const __dirname=path.dirname(__filename);
const app=express();
app.set('trust proxy', 1);
app.use(cookieParser(process.env.COOKIE_SECRET||"dev_secret"));
app.use(express.json()); app.use(express.urlencoded({extended:true})); app.use(express.static(path.join(__dirname,"public")));

const COOKIE_FLAGS={ httpOnly:true, secure:process.env.NODE_ENV==="production", sameSite:"lax", signed:true };
const OIDC_TEMP_COOKIE="oidc_tmp";

app.get("/",(req,res)=>res.sendFile(path.join(__dirname,"public/index.html")));
app.get("/dashboard",(req,res)=>res.sendFile(path.join(__dirname,"public/dashboard.html")));
app.get("/api/me",(req,res)=>{ const raw=req.signedCookies[process.env.SESSION_COOKIE_NAME||"app_session"]; if(!raw) return res.status(401).json({error:"not_authenticated"}); try{ return res.json({user:JSON.parse(raw)});}catch{ return res.status(401).json({error:"invalid_session"});} });

app.get("/auth/login", async (req,res)=>{
  try{
    const discovery=await getDiscovery(process.env.IDP_DISCOVERY_URL);
    const allowed=new Set(["/","/dashboard","/membership/home","/app"]);
    const rt=allowed.has(req.query.returnTo)?req.query.returnTo:(process.env.POST_LOGIN_PATH||"/membership/home");
    const state=randomString(24), nonce=randomString(24), code_verifier=generateCodeVerifier(), code_challenge=await generateCodeChallenge(code_verifier);
    res.cookie(OIDC_TEMP_COOKIE, JSON.stringify({state,nonce,code_verifier,createdAt:Date.now(),returnTo:rt}), {...COOKIE_FLAGS, maxAge:5*60*1000});
    const authorizeUrl=buildAuthorizeUrl({
      authorization_endpoint: discovery.authorization_endpoint,
      client_id: process.env.IDP_CLIENT_ID,
      redirect_uri: process.env.IDP_REDIRECT_URI,
      scope: process.env.IDP_SCOPE || "openid profile email",
      state, nonce, code_challenge
    });
    console.log("Authorize URL:", authorizeUrl);
    return res.redirect(authorizeUrl);
  }catch(e){ console.error("Login init error:", e); return res.status(500).send(`<pre>Login init failed:\n${e?.message||e}</pre>`); }
});

app.get("/auth/callback", async (req,res)=>{
  try{
    console.log("Callback query:", req.query);
    const {code,state}=req.query; if(!code||!state) return res.status(400).send("Missing code/state");
    const tmpRaw=req.signedCookies[OIDC_TEMP_COOKIE]; if(!tmpRaw) return res.status(400).send("Auth flow expired");
    const tmp=JSON.parse(tmpRaw); res.clearCookie(OIDC_TEMP_COOKIE, COOKIE_FLAGS); if(state!==tmp.state) return res.status(400).send("State mismatch");

    const discovery=await getDiscovery(process.env.IDP_DISCOVERY_URL);
    const tokens=await exchangeCodeForTokens({ token_endpoint: discovery.token_endpoint, client_id: process.env.IDP_CLIENT_ID, client_secret: process.env.IDP_CLIENT_SECRET, code, redirect_uri: process.env.IDP_REDIRECT_URI, code_verifier: tmp.code_verifier });
    console.log("Tokens received keys:", Object.keys(tokens));

    const idPayload=await verifyIdToken({ id_token: tokens.id_token, audience: process.env.IDP_CLIENT_ID, jwks_uri: discovery.jwks_uri, expectedNonce: tmp.nonce });
    console.log("ID token payload keys:", Object.keys(idPayload));

    const profile=toNormalizedProfile(idPayload); if(!profile.email) return res.status(400).send("No email claim present for this account.");

    let member=await getMemberByEmail(profile.email);
    if(!member){
      const plan=process.env.MEMBERSTACK_DEFAULT_FREE_PLAN||"";
      member=await createMember({ email: profile.email, firstName: profile.given_name||"", lastName: profile.family_name||"", planId: plan||undefined, json:{idp_sub: profile.sub, name: profile.name}, customFields:{} });
    }else{
      const updates={}; if(profile.given_name||profile.family_name){ updates.customFields={...(member.customFields||{})}; }
      if(Object.keys(updates).length>0){ try{ await updateMember(member.id, updates); }catch{} }
    }

    const session={ email: profile.email, sub: profile.sub, memberId: member?.id||null, ts: Date.now() };
    res.cookie(process.env.SESSION_COOKIE_NAME||"app_session", JSON.stringify(session), {...COOKIE_FLAGS, maxAge: 7*24*60*60*1000});

// === Plan A: establish Memberstack browser session via token ===
let tokenRes = await createSessionToken(member.id);
const finalDest = `${process.env.APP_BASE_URL || ""}${tmp.returnTo || (process.env.POST_LOGIN_PATH || "/membership/home")}`;

if (tokenRes?.token) {
  const escapedToken = JSON.stringify(tokenRes.token).replace(/</g, "\u003c");
  const escapedDest  = JSON.stringify(finalDest).replace(/</g, "\u003c");
  return res.status(200).send(`<!doctype html>
<meta charset="utf-8"><title>Signing you in…</title>
<script data-memberstack-app="YOUR_PUBLIC_KEY_HERE" src="https://static.memberstack.com/scripts/v1/memberstack.js" async></script>
<p style="font-family:system-ui,Segoe UI,Arial;margin:2rem;">Signing you in…</p>
<script>
  (function(){
    function go(){ window.location.replace(${escapedDest}); }
    function onReady(fn){
      if (window.MemberStack && window.MemberStack.onReady) return window.MemberStack.onReady.then(fn).catch(go);
      document.addEventListener('msready', function(){ onReady(fn); }, { once: true });
      setTimeout(fn, 4000);
    }
    onReady(async function(ms){
      try {
        ms = ms || (window.MemberStack && (await window.MemberStack.onReady));
        if (ms && ms.loginWithToken) { await ms.loginWithToken(${escapedToken}); }
      } catch(_) {}
      go();
    });
    setTimeout(go, 5000);
  })();
</script>`);
}

// If token didn’t work, try a magic link (one-time login) and redirect there
const magic = await createMagicLink(member.id, finalDest);
if (magic?.url) {
  console.log("[MS] redirecting to magic link");
  return res.redirect(magic.url);
}

// Fallback: just go to the final page (may be gated if no session)
console.warn("[MS] no token or magic link; redirecting without session");
return res.redirect(finalDest);
return res.status(200).send(`<!doctype html>
<meta charset="utf-8"><title>Signing you in…</title>
<script data-memberstack-app="YOUR_PUBLIC_KEY_HERE" src="https://static.memberstack.com/scripts/v1/memberstack.js" async></script>
<p style="font-family:system-ui,Segoe UI,Arial;margin:2rem;">Signing you in…</p>
<script>
  (function(){
    function go(){ window.location.replace(${d}); }
    function onReady(fn){
      if (window.MemberStack && window.MemberStack.onReady) return window.MemberStack.onReady.then(fn).catch(go);
      document.addEventListener('msready', function(){ onReady(fn); }, { once: true });
      setTimeout(fn, 4000);
    }
    onReady(async function(ms){
      try {
        ms = ms || (window.MemberStack && (await window.MemberStack.onReady));
        if (ms && ms.loginWithToken) { await ms.loginWithToken(${t}); }
      } catch(_) {}
      go();
    });
    setTimeout(go, 5000);
  })();
</script>`);
  }catch(e){
    console.error("Callback error:", e);
    return res.status(500).send(`<pre style="white-space:pre-wrap;font-family:system-ui">
Callback failed:
${e?.message||String(e)}
</pre>`);
  }
});

app.get("/logout",(req,res)=>{ res.clearCookie(process.env.SESSION_COOKIE_NAME||"app_session", COOKIE_FLAGS); res.redirect("/"); });

const port=process.env.PORT||3000; app.listen(port, ()=>console.log(`Listening on port ${port}`));
