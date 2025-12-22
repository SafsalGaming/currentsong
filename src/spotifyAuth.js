// src/spotifyAuth.js

const CLIENT_ID = import.meta.env.VITE_SPOTIFY_CLIENT_ID;
const PROD_REDIRECT_URI = import.meta.env.VITE_SPOTIFY_REDIRECT_URI;
const SCOPES = (import.meta.env.VITE_SPOTIFY_SCOPES || "").trim();

const LS = {
  verifier: "sp_pkce_verifier",
  access: "sp_access_token",
  refresh: "sp_refresh_token",
  expiresAt: "sp_expires_at",
};

function getRedirectUri() {
  // מקומי: לא חייב env
  if (window.location.hostname === "localhost") {
    return "http://localhost:5173/callback";
  }
  // פרודקשן: חייב להיות בדיוק מה שהגדרת בדשבורד
  return PROD_REDIRECT_URI;
}

function base64UrlEncode(bytes) {
  const binString = String.fromCharCode(...new Uint8Array(bytes));
  return btoa(binString).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function randomString(length = 64) {
  const arr = new Uint8Array(length);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => ("0" + b.toString(16)).slice(-2)).join("");
}

async function sha256(str) {
  const data = new TextEncoder().encode(str);
  return await crypto.subtle.digest("SHA-256", data);
}

async function pkceChallengeFromVerifier(verifier) {
  const hashed = await sha256(verifier);
  return base64UrlEncode(hashed);
}

export function isLoggedIn() {
  return !!localStorage.getItem(LS.access);
}

export function logout() {
  Object.values(LS).forEach((k) => localStorage.removeItem(k));
}

export function getAccessToken() {
  return localStorage.getItem(LS.access);
}

export function tokenIsExpiredSoon() {
  const expiresAt = Number(localStorage.getItem(LS.expiresAt) || "0");
  return Date.now() > expiresAt - 30_000;
}

export async function loginWithSpotify() {
  if (!CLIENT_ID) throw new Error("Missing VITE_SPOTIFY_CLIENT_ID");
  const redirect_uri = getRedirectUri();
  if (!redirect_uri) throw new Error("Missing redirect uri (check VITE_SPOTIFY_REDIRECT_URI on Netlify)");

  const verifier = randomString(64);
  const challenge = await pkceChallengeFromVerifier(verifier);
  localStorage.setItem(LS.verifier, verifier);

  const params = new URLSearchParams({
    response_type: "code",
    client_id: CLIENT_ID,
    redirect_uri,
    code_challenge_method: "S256",
    code_challenge: challenge,
    scope: SCOPES,
  });

  window.location.href = `https://accounts.spotify.com/authorize?${params.toString()}`;
}

async function exchangeCodeForTokens(code) {
  const verifier = localStorage.getItem(LS.verifier);
  if (!verifier) throw new Error("Missing PKCE verifier (try login again)");

  const redirect_uri = getRedirectUri();

  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    grant_type: "authorization_code",
    code,
    redirect_uri,
    code_verifier: verifier,
  });

  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Token exchange failed: ${res.status} ${t}`);
  }

  return await res.json();
}

export async function refreshAccessToken() {
  const refresh = localStorage.getItem(LS.refresh);
  if (!refresh) throw new Error("No refresh token");

  const body = new URLSearchParams({
    client_id: CLIENT_ID,
    grant_type: "refresh_token",
    refresh_token: refresh,
  });

  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Refresh failed: ${res.status} ${t}`);
  }

  const data = await res.json();

  if (data.refresh_token) localStorage.setItem(LS.refresh, data.refresh_token);
  localStorage.setItem(LS.access, data.access_token);
  localStorage.setItem(LS.expiresAt, String(Date.now() + data.expires_in * 1000));

  return data.access_token;
}

export async function handleCallbackIfPresent() {
  const url = new URL(window.location.href);

  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  // רק בנתיב callback
  if (!window.location.pathname.startsWith("/callback")) return false;

  if (error) throw new Error(`Spotify auth error: ${error}`);
  if (!code) return false;

  const data = await exchangeCodeForTokens(code);

  localStorage.setItem(LS.access, data.access_token);
  if (data.refresh_token) localStorage.setItem(LS.refresh, data.refresh_token);
  localStorage.setItem(LS.expiresAt, String(Date.now() + data.expires_in * 1000));

  // לנקות URL ולחזור לדף הראשי
  window.history.replaceState({}, document.title, "/");
  return true;
}
