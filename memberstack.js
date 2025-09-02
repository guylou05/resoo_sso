
import axios from "axios";

const BASE = process.env.MEMBERSTACK_API_BASE || "https://admin.memberstack.com";
const SECRET = process.env.MEMBERSTACK_SECRET_KEY;
if (!SECRET) console.warn("[memberstack] MEMBERSTACK_SECRET_KEY is not set.");

const headers = { "X-API-KEY": SECRET || "", "Content-Type": "application/json" };

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

/** Create a short-lived login/session token for a member (Admin API). */
export async function createSessionToken(memberId) {
  const url = `${BASE}/members/${memberId}/token`;
  try {
    const res = await axios.post(url, {}, { headers });
    console.log("[MS] token response keys:", Object.keys(res.data || {}), "status:", res.status);
    // Try common shapes:
    const token = res?.data?.data?.token || res?.data?.token || res?.data?.sessionToken;
    if (!token) {
      console.error("[MS] token missing in response:", res.data);
      return null;
    }
    return token;
  } catch (e) {
    console.error("[MS] createSessionToken error:", e?.response?.status, e?.response?.data || e?.message);
    return null;
  }
}
function cryptoRandom(len = 24) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let s = "";
  for (let i = 0; i < len; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
  return s;
}
