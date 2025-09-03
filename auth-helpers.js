import crypto from "crypto";
import fetch from "node-fetch";
import { createRemoteJWKSet, jwtVerify } from "jose";

function base64url(buf) {
  return buf.toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

export function generateCodeVerifier(length = 64) {
  return base64url(crypto.randomBytes(length));
}

export async function generateCodeChallenge(codeVerifier) {
  const hash = crypto.createHash("sha256").update(codeVerifier).digest();
  return base64url(hash);
}

export function randomString(n = 32) {
  return base64url(crypto.randomBytes(n));
}

export async function getDiscovery(discoveryUrl) {
  const res = await fetch(discoveryUrl);
  if (!res.ok) throw new Error(`Discovery failed: ${res.status}`);
  return res.json();
}

export function buildAuthorizeUrl({
  authorization_endpoint,
  client_id,
  redirect_uri,
  scope,
  state,
  nonce,
  code_challenge,
}) {
  const params = new URLSearchParams({
    client_id,
    response_type: "code",
    redirect_uri,
    scope,
    state,
    nonce,
    code_challenge,
    code_challenge_method: "S256",
  });
  return `${authorization_endpoint}?${params.toString()}`;
}

export async function exchangeCodeForTokens({
  token_endpoint,
  client_id,
  client_secret,
  code,
  redirect_uri,
  code_verifier,
}) {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id,
    client_secret,
    code,
    redirect_uri,
    code_verifier,
  });
  const res = await fetch(token_endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`Token exchange failed: ${res.status} ${await res.text()}`);
  return res.json();
}

export async function verifyIdToken({ id_token, jwks_uri, audience, expectedNonce }) {
  const JWKS = createRemoteJWKSet(new URL(jwks_uri));
  const { payload } = await jwtVerify(id_token, JWKS, {
    audience,
    maxTokenAge: "10m",
    clockTolerance: 300,
  });
  const iss = String(payload.iss || "");
  const isMsIssuer = /^https:\\/\\/login\\.microsoftonline\\.com\\/[0-9a-f-]+\\/v2\\.0$/i.test(iss);
  if (!isMsIssuer) throw new Error(`unexpected issuer: ${iss}`);
  if (expectedNonce && payload.nonce !== expectedNonce) throw new Error("Nonce mismatch");
  return payload;
}

export function toNormalizedProfile(payload) {
  const email = payload.email || payload.preferred_username || null;
  let given = payload.given_name || "";
  let family = payload.family_name || "";

  if ((!given || !family) && payload.name) {
    const parts = String(payload.name).split(" ");
    if (!given) given = parts[0] || "";
    if (!family) family = parts.slice(1).join(" ");
  }
  const name = payload.name || [given, family].filter(Boolean).join(" ").trim();

  return {
    sub: payload.sub,
    email,
    given_name: given,
    family_name: family,
    name,
    raw: payload,
  };
}
