// memberstack.js
import axios from "axios";

const BASE = process.env.MEMBERSTACK_API_BASE || "https://admin.memberstack.com";
const SECRET = process.env.MEMBERSTACK_SECRET_KEY;
if (!SECRET) console.warn("[memberstack] MEMBERSTACK_SECRET_KEY is not set.");

const headers = { "X-API-KEY": SECRET || "", "Content-Type": "application/json" };

/** Try several token endpoints in order; return { token } or null */
export async function createSessionToken(memberId) {
  const attempts = [
    // Some workspaces expose a member-scoped token route
    { method: "post", url: `${BASE}/members/${memberId}/token`, body: {} },

    // Some expose "create-session" on the member
    { method: "post", url: `${BASE}/members/${memberId}/create-session`, body: {} },

    // Some use a collection route that accepts memberId
    { method: "post", url: `${BASE}/members/session`, body: { memberId } },

    // Occasionally named differently
    { method: "post", url: `${BASE}/sessions`, body: { memberId } },
    { method: "post", url: `${BASE}/auth/token`, body: { memberId } },
  ];

  for (const a of attempts) {
    try {
      const res = await axios({ method: a.method, url: a.url, data: a.body, headers });
      console.log("[MS] token attempt OK:", a.url, "status:", res.status, "keys:", Object.keys(res.data||{}));
      const token =
        res?.data?.data?.token ||
        res?.data?.token ||
        res?.data?.sessionToken ||
        res?.data?.jwt;
      if (token) return { token };
      console.warn("[MS] token attempt had no token field:", a.url, res.data);
    } catch (e) {
      const status = e?.response?.status;
      const body = e?.response?.data;
      console.warn("[MS] token attempt failed:", a.url, status, body||e?.message);
    }
  }
  return null;
}

/** Fallback: try to create a one-time login (magic) link for the member */
export async function createMagicLink(memberId, redirectTo) {
  const attempts = [
    // member-scoped magic link
    { method: "post", url: `${BASE}/members/${memberId}/magic-link`, body: { redirectTo } },
    // collection route
    { method: "post", url: `${BASE}/members/magic-link`, body: { memberId, redirectTo } },
    // sometimes named login-link
    { method: "post", url: `${BASE}/members/${memberId}/login-link`, body: { redirectTo } },
  ];
  for (const a of attempts) {
    try {
      const res = await axios({ method: a.method, url: a.url, data: a.body, headers });
      console.log("[MS] magic-link attempt OK:", a.url, "status:", res.status, "keys:", Object.keys(res.data||{}));
      const url =
        res?.data?.data?.url ||
        res?.data?.url ||
        res?.data?.link;
      if (url) return { url };
      console.warn("[MS] magic-link attempt had no url field:", a.url, res.data);
    } catch (e) {
      const status = e?.response?.status;
      const body = e?.response?.data;
      console.warn("[MS] magic-link attempt failed:", a.url, status, body||e?.message);
    }
  }
  return null;
}

export async function getMemberByEmail(email) {
  const url = `${BASE}/members/${encodeURIComponent(email)}`;
  try {
    const res = await axios.get(url, { headers });
    return res.data?.data || null;
  } catch (err) {
    if (err.response && err.response.status === 404) return null;
    throw err;
  }
}

export async function createMember({ email, firstName, lastName, planId, json = {}, customFields = {} }) {
  const url = `${BASE}/members`;
  const strongPassword = cryptoRandom(24);
  const payload = { email, password: strongPassword, customFields, json };
  if (planId) payload.plans = [{ planId }];
  const res = await axios.post(url, payload, { headers });
  return res.data?.data || res.data;
}

export async function updateMember(memberId, updates) {
  const url = `${BASE}/members/${memberId}`;
  const res = await axios.patch(url, updates, { headers });
  return res.data?.data || res.data;
}

function cryptoRandom(len = 24) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let s = "";
  for (let i = 0; i < len; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
  return s;
}
