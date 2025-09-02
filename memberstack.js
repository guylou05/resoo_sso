
import axios from "axios";
const BASE=process.env.MEMBERSTACK_API_BASE||"https://admin.memberstack.com";
const SECRET=process.env.MEMBERSTACK_SECRET_KEY;
if(!SECRET){console.warn("[memberstack] MEMBERSTACK_SECRET_KEY is not set.");}
const headers={"X-API-KEY":SECRET||"","Content-Type":"application/json"};

export async function getMemberByEmail(email){
  const url=`${BASE}/members/${encodeURIComponent(email)}`;
  try{const r=await axios.get(url,{headers});return r.data?.data||null;}catch(e){if(e.response&&e.response.status===404)return null;throw e;}
}
export async function createMember({email,firstName,lastName,planId,json={},customFields={}}){
  const url=`${BASE}/members`; const strong=cryptoRandom(24);
  const payload={email,password:strong,customFields,json}; if(planId)payload.plans=[{planId}];
  const r=await axios.post(url,payload,{headers}); return r.data?.data||r.data;
}
export async function updateMember(id,updates){const r=await axios.patch(`${BASE}/members/${id}`,updates,{headers});return r.data?.data||r.data;}
export async function verifyMemberToken(token){const r=await axios.post(`${BASE}/members/verify-token`,{token},{headers});return r.data?.data||r.data;}

function cryptoRandom(len=24){const a="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";let s="";for(let i=0;i<len;i++)s+=a[Math.floor(Math.random()*a.length)];return s;}
