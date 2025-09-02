
import crypto from "crypto";
import fetch from "node-fetch";
import { createRemoteJWKSet, jwtVerify } from "jose";

function base64url(buf){return buf.toString("base64").replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_");}
export function generateCodeVerifier(l=64){return base64url(crypto.randomBytes(l));}
export async function generateCodeChallenge(v){const h=crypto.createHash("sha256").update(v).digest();return base64url(h);}
export function randomString(n=32){return base64url(crypto.randomBytes(n));}

export async function getDiscovery(url){const r=await fetch(url);if(!r.ok)throw new Error(`Discovery failed: ${r.status}`);return r.json();}

export function buildAuthorizeUrl({authorization_endpoint,client_id,redirect_uri,scope,state,nonce,code_challenge}){
  const p=new URLSearchParams({client_id,response_type:"code",redirect_uri,scope,state,nonce,code_challenge,code_challenge_method:"S256"});
  return `${authorization_endpoint}?${p.toString()}`;
}

export async function exchangeCodeForTokens({token_endpoint,client_id,client_secret,code,redirect_uri,code_verifier}){
  const body=new URLSearchParams({grant_type:"authorization_code",client_id,client_secret,code,redirect_uri,code_verifier});
  const r=await fetch(token_endpoint,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body});
  if(!r.ok)throw new Error(`Token exchange failed: ${r.status} ${await r.text()}`);
  return r.json();
}

export async function verifyIdToken({id_token,issuer,audience,jwks_uri,expectedNonce}){
  const JWKS=createRemoteJWKSet(new URL(jwks_uri));
  const { payload }=await jwtVerify(id_token,JWKS,{issuer,audience,maxTokenAge:"5m"});
  if(expectedNonce && payload.nonce!==expectedNonce) throw new Error("Nonce mismatch");
  return payload;
}

export function toNormalizedProfile(payload){
  const email=payload.email||payload.preferred_username||null;
  let given=payload.given_name||"", family=payload.family_name||"";
  if((!given||!family)&&payload.name){const parts=String(payload.name).split(" ");if(!given)given=parts[0]||"";if(!family)family=parts.slice(1).join(" ");}
  const name=payload.name||[given,family].filter(Boolean).join(" ").trim();
  return { sub: payload.sub, email, given_name: given, family_name: family, name, raw: payload };
}
