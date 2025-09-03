import axios from "axios";

const BASE = process.env.MEMBERSTACK_API_BASE || "https://admin.memberstack.com";
const SECRET = process.env.MEMBERSTACK_SECRET_KEY;
if (!SECRET) console.warn("[memberstack] MEMBERSTACK_SECRET_KEY is not set.");

const headers = { "X-API-KEY": SECRET || "", "Content-Type": "application/json" };

export async function createSessionToken(memberId) {
  const attempts = [
    { method: "post", url: `${BASE}/members/session`, body: { memberId } },
    { method: "post", url: `${BASE}/sessions`, body: { memberId } },
    { method: "post", url: `${BASE}/auth/token`, body: { memberId } },
  ];
  for (const a of attempts) {
    try {
      const res = await axios({ method: a.method, url: a.url, data: a.body, headers });
      const token = res?.data?.data?.token || res?.data?.token || res?.data?.sessionToken || res?.data?.jwt;
      if (token) return { token };
    } catch (e) {
      console.warn("[MS] token attempt failed:", a.url, e?.response?.status, e?.response?.data || e?.message);
    }
  }
  return null;
}

export async function createMagicLink(memberId, redirectTo) {
  try {
    const res = await axios({
      method: "post",
      url: `${BASE}/members/magic-link`,
      data: { memberId, redirectTo },
      headers,
    });
    const url = res?.data?.data?.url || res?.data?.url || res?.data?.link;
    if (url) return { url };
  } catch (e) {
    console.warn("[MS] magic-link failed:", e?.response?.status, e?.response?.data || e?.message);
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
  const payload = {
    email,
    password: strongPassword,
    firstName: firstName || "",
    lastName: lastName || "",
    customFields,
    json,
  };
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
