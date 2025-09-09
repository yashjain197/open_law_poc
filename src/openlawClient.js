// src/openlawClient.js
import { APIClient } from "openlaw/dist/esm/index.esm.js";

let client = null;
let creatorId = null;     // we’ll store a UUID if we can find one, else fall back to email
let currentEmail = null;
let jwt = null;

const DEFAULT_ROOT = "https://lib.openlaw.io/api/v1/default";

// Optional helper to decode JWTs if we receive one;
// we won't rely on this existing, it’s best-effort only.
function decodeJwt(token) {
  try {
    const base64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export function setClientRoot(root) {
  client = new APIClient(root || DEFAULT_ROOT);
  return client;
}

export function getClient() {
  if (!client) client = new APIClient(DEFAULT_ROOT);
  return client;
}

export function getCreatorId() {
  return creatorId;
}

export function getCurrentEmail() {
  return currentEmail;
}

export function getJwt() {
  return jwt;
}

// NOTE: Do NOT require OPENLAW_JWT header to exist — the APIClient
// keeps the token internally after login. (Docs confirm this.)
export async function loginAndRemember(email, password) {
  const c = getClient();
  const res = await c.login(email, password); // JWT handled internally by APIClient. :contentReference[oaicite:2]{index=2}

  // Best-effort: try to read a token if one is exposed — but don’t fail if not.
  const headers = res?.headers;
  const token =
    headers?.OPENLAW_JWT ||
    headers?.get?.("OPENLAW_JWT") ||
    headers?.get?.("openlaw_jwt") ||
    res?.token ||
    null;

  jwt = token || null;
  currentEmail = email;

  // Try to extract a user UUID from the token if available.
  const payload = token ? decodeJwt(token) : null;
  const possibleId =
    payload?.id || payload?.userId || payload?.sub || payload?.uid || null;

  // Fallback to email (many instances accept email as `creator`)
  creatorId = possibleId || email;

  return { token: jwt, creatorId, email: currentEmail };
}

// Build Identity JSON string; if we don’t know a UUID, emit email-only shape.
export function makeOpenLawIdentity(idOrNull, email) {
  const base = {
    email,
    identifiers: [{ identityProviderId: "openlaw", identifier: email }],
  };
  const payload = idOrNull ? { id: { id: idOrNull }, ...base } : base;
  return JSON.stringify(payload);
}
