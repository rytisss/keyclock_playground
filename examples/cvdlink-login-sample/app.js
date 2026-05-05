// Minimal Authorization Code + PKCE flow against Keycloak.
// Vanilla JS — no library — so every step is visible.

const config = {
  authority: "http://localhost:8081/realms/cvdlink",
  clientId: "spa-client",
  redirectUri: window.location.origin + "/",
  apiBase: "http://localhost:3001",
  scope: "openid profile email",
};

const $ = (id) => document.getElementById(id);
const setStatus = (msg, cls = "") => { $("status").className = cls; $("status").textContent = msg; };
const setClaims = (obj) => { $("claims").textContent = obj ? JSON.stringify(obj, null, 2) : "—"; };
const setApiOut = (obj, cls = "") => { $("apiOut").className = cls; $("apiOut").textContent = typeof obj === "string" ? obj : JSON.stringify(obj, null, 2); };

// ---------- PKCE helpers ----------

function randomString(len = 64) {
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  return base64url(arr);
}

function base64url(buf) {
  const bytes = buf instanceof ArrayBuffer ? new Uint8Array(buf) : buf;
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sha256(str) {
  const buf = new TextEncoder().encode(str);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return base64url(hash);
}

function decodeJwt(token) {
  const [, payload] = token.split(".");
  const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
  return JSON.parse(decodeURIComponent(escape(json)));
}

// ---------- Auth flow ----------

async function login() {
  const verifier = randomString(64);
  const challenge = await sha256(verifier);
  const state = randomString(16);

  sessionStorage.setItem("pkce_verifier", verifier);
  sessionStorage.setItem("pkce_state", state);

  const url = new URL(`${config.authority}/protocol/openid-connect/auth`);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", config.scope);
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");

  window.location.assign(url.toString());
}

async function exchangeCode(code) {
  const verifier = sessionStorage.getItem("pkce_verifier");
  if (!verifier) throw new Error("missing PKCE verifier");

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: config.clientId,
    code,
    redirect_uri: config.redirectUri,
    code_verifier: verifier,
  });

  const res = await fetch(`${config.authority}/protocol/openid-connect/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) throw new Error(`token exchange failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function logout() {
  const idToken = sessionStorage.getItem("id_token");
  sessionStorage.clear();
  setClaims(null);
  setApiOut("—");

  const url = new URL(`${config.authority}/protocol/openid-connect/logout`);
  url.searchParams.set("client_id", config.clientId);
  if (idToken) url.searchParams.set("id_token_hint", idToken);
  url.searchParams.set("post_logout_redirect_uri", config.redirectUri);
  window.location.assign(url.toString());
}

function getAccessToken() {
  return sessionStorage.getItem("access_token");
}

async function callApi(path) {
  const token = getAccessToken();
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  try {
    const res = await fetch(`${config.apiBase}${path}`, { headers });
    const text = await res.text();
    let body;
    try { body = JSON.parse(text); } catch { body = text; }
    setApiOut({ status: res.status, body }, res.ok ? "ok" : "err");
  } catch (err) {
    setApiOut(`network error: ${err.message}`, "err");
  }
}

// ---------- Page boot ----------

async function init() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  const returnedState = params.get("state");

  if (code) {
    const expected = sessionStorage.getItem("pkce_state");
    if (returnedState !== expected) {
      setStatus("state mismatch — possible CSRF", "err");
      return;
    }
    try {
      const tokens = await exchangeCode(code);
      sessionStorage.setItem("access_token", tokens.access_token);
      sessionStorage.setItem("id_token", tokens.id_token || "");
      sessionStorage.setItem("refresh_token", tokens.refresh_token || "");
      window.history.replaceState({}, "", config.redirectUri);
    } catch (err) {
      setStatus(`login failed: ${err.message}`, "err");
      return;
    }
  }

  const token = getAccessToken();
  if (token) {
    const claims = decodeJwt(token);
    setStatus(`logged in as ${claims.preferred_username}`, "ok");
    setClaims(claims);
  } else {
    setStatus("not logged in");
    setClaims(null);
  }
}

$("login").onclick = login;
$("logout").onclick = logout;
$("callPublic").onclick = () => callApi("/public");
$("callProtected").onclick = () => callApi("/protected");
$("callAdmin").onclick = () => callApi("/admin");

init();
