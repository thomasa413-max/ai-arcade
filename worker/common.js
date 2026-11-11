// Utilitaires communs aux modules du Worker (aucune dépendance).
export function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...extra },
  });
}

export async function sha256(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Comparaison à durée constante (jetons, secrets). */
export function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

/** Les requêtes qui modifient des données doivent venir du site lui-même. */
export function sameOrigin(request, url) {
  const origin = request.headers.get("Origin");
  return !origin || origin === url.origin;
}

/** Code pays à deux lettres fourni par Cloudflare ; XX = inconnu, T1 = réseau Tor : renvoie null dans ces cas. */
export function countryOf(request) {
  const c = String((request.cf && request.cf.country) || request.headers.get("CF-IPCountry") || "").toUpperCase();
  return /^[A-Z]{2}$/.test(c) && c !== "XX" && c !== "T1" ? c : null;
}

export function deviceOf(ua) {
  if (/ipad|tablet|kindle|silk|(android(?!.*mobile))/i.test(ua)) return "tablet";
  if (/mobi|iphone|ipod|android/i.test(ua)) return "mobile";
  return "desktop";
}

/** Système d'exploitation d'après le User-Agent : ios, android, windows, macos, linux, chromeos ou other (seule la famille est gardée, jamais la version).
 *  Remarque : l'iPad en « version ordinateur » de Safari se présente comme un Mac et sera compté en macos. */
export function osOf(ua) {
  if (/iphone|ipod|ipad/i.test(ua)) return "ios";
  if (/android/i.test(ua)) return "android";
  if (/cros/i.test(ua)) return "chromeos";
  if (/windows/i.test(ua)) return "windows";
  if (/macintosh|mac os x/i.test(ua)) return "macos";
  if (/linux|x11/i.test(ua)) return "linux";
  return "other";
}

/** Hôte de provenance sans « www. » ; null si c'est le site lui-même ; "direct" si l'adresse est illisible. */
export function refererHost(ref, host) {
  try {
    const h = new URL(ref).hostname.replace(/^www\./, "").toLowerCase();
    if (!h || h === host.replace(/^www\./, "")) return null;
    return h.slice(0, 80);
  } catch { return "direct"; }
}

export const today = () => new Date().toISOString().slice(0, 10);
export const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
