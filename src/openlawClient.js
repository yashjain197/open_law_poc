// src/openlawClient.js
import { APIClient } from "openlaw/dist/esm/index.esm.js";

let client = null;
let creatorId = null; // we’ll store a UUID if we can find one, else fall back to email
let currentEmail = null;
let jwt = null;

const DEFAULT_ROOT = "https://lib.openlaw.io/api/v1/default";

// Optional helper to decode JWTs if we receive one; best-effort only.
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
export function getRoot() {
  const c = getClient();
  // APIClient stores root as either .root or .root.root depending on build
  return (c && (c.root?.root || c.root)) || DEFAULT_ROOT;
}

// NOTE: Do NOT require OPENLAW_JWT header to exist — the APIClient
// keeps the token internally after login. (Docs confirm this.)
export async function loginAndRemember(email, password) {
  const c = getClient();
  const res = await c.login(email, password); // JWT handled internally by APIClient.

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
  const possibleId = payload?.id || payload?.userId || payload?.sub || payload?.uid || null;

  // Fallback to email (many instances accept email as creator)
  creatorId = possibleId || email;

  return { token: jwt, creatorId, email: currentEmail };
}

// Build Identity JSON string; if we don’t know a UUID, emit email-only shape.
export function makeOpenLawIdentity(idOrNull, email) {
  const base = { email, identifiers: [{ identityProviderId: "openlaw", identifier: email }] };
  const payload = idOrNull ? { id: { id: idOrNull }, ...base } : base;
  return JSON.stringify(payload);
}

/**
 * Reliable uploader that copes with servers returning 303 See Other.
 * It tries the official client first; if that surfaces a redirect as an “error”,
 * it falls back to a direct fetch that either:
 *   - gets JSON { id }, or
 *   - follows the redirect and extracts /contract/{id} from the final URL, or
 *   - reads the Location header if exposed by CORS.
 */
export async function uploadContractSmart(params) {
  const c = getClient();

  // 1) Try the library first.
  try {
    const result = await c.uploadContract(params);
    if (typeof result === "string") return result;
    if (result && typeof result.id === "string") return result.id;
    if (result && typeof result.contractId === "string") return result.contractId;
  } catch (e) {
    // swallow and try manual path
  }

  // 2) Manual POST with 303 handling.
  const root = getRoot();
  const url = `${root.replace(/\/$/, "")}/upload/contract`;
  const body = typeof params === "string" ? params : JSON.stringify(params);

  // Helper: extract id from a URL like https://.../web/default/contract/{id}
  const extractId = (u) => {
    try {
      const m = String(u || "").match(/\/contract\/([A-Za-z0-9]+)/);
      return m ? m[1] : "";
    } catch {
      return "";
    }
  };

  // Attempt #1: manual redirect so we can read Location header if present.
  let resp;
  try {
    resp = await fetch(url, {
      method: "POST",
      mode: "cors",
      redirect: "manual",
      headers: {
        "Content-Type": "text/plain;charset=UTF-8",
        Accept: "application/json",
        ...(jwt ? { OPENLAW_JWT: jwt } : {}),
      },
      body,
    });

    if (resp.status === 303) {
      const loc =
        resp.headers.get("Location") ||
        resp.headers.get("location") ||
        resp.headers.get("LOCATION");
      const idFromLoc = extractId(loc);
      if (idFromLoc) return idFromLoc;
      // fall through to attempt #2
    } else if (resp.ok) {
      // Maybe the server returned JSON
      const text = await resp.text();
      try {
        const j = JSON.parse(text);
        if (j?.id) return j.id;
        if (j?.contractId) return j.contractId;
      } catch {
        // If it redirected silently (some proxies), try URL extraction
        const idFromUrl = extractId(resp.url);
        if (idFromUrl) return idFromUrl;
      }
    }
  } catch {
    // ignore, try follow mode
  }

  // Attempt #2: follow redirects and read the final URL (often ends with /contract/{id})
  const resp2 = await fetch(url, {
    method: "POST",
    mode: "cors",
    redirect: "follow",
    headers: {
      "Content-Type": "text/plain;charset=UTF-8",
      Accept: "application/json",
      ...(jwt ? { OPENLAW_JWT: jwt } : {}),
    },
    body,
  });

  if (resp2.ok) {
    const idFromUrl = extractId(resp2.url);
    if (idFromUrl) return idFromUrl;

    const text = await resp2.text().catch(() => "");
    try {
      const j = JSON.parse(text);
      if (j?.id) return j.id;
      if (j?.contractId) return j.contractId;
    } catch {
      /* ignore */
    }
  }

  throw new Error(
    `Contract upload did not return an ID (status ${resp2.status}). Please check your OpenLaw instance.`
  );
}
