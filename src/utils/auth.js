// utils/auth.js
import jwtDecode from "jwt-decode";

// Works with `apiClient.login(...)` response
export function extractCreatorIdFromLoginResponse(loginRes) {
  // Some builds attach headers as a plain object; others as a Headers instance.
  const headers = loginRes?.headers;
  let jwt =
    headers?.OPENLAW_JWT ||
    headers?.get?.("OPENLAW_JWT") ||
    headers?.get?.("openlaw_jwt");

  if (!jwt && loginRes?.token) {
    // Some older wrappers expose `token`
    jwt = loginRes.token;
  }

  if (!jwt) throw new Error("Could not find OPENLAW_JWT in login response");

  const payload = jwtDecode(jwt);
  // Try likely claim names in order
  return payload.id || payload.userId || payload.sub;
}
