// Double authentification (TOTP, RFC 6238) : codes à 6 chiffres de Google Authenticator, Microsoft Authenticator, 1Password, Authy…
// Module du site-kit, sans dépendance (WebCrypto). Secret côté hébergeur : ADMIN_TOTP_SECRET (base32). Génération : `node site-kit/tools/totp-secret.mjs`.
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Decode(s) {
  const clean = String(s).toUpperCase().replace(/[\s=-]/g, "");
  let bits = "";
  for (const c of clean) { const i = B32.indexOf(c); if (i < 0) throw new Error("base32 invalide"); bits += i.toString(2).padStart(5, "0"); }
  const out = new Uint8Array(Math.floor(bits.length / 8));
  for (let i = 0; i < out.length; i++) out[i] = parseInt(bits.slice(i * 8, i * 8 + 8), 2);
  return out;
}

export function base32Encode(bytes) {
  let bits = "", out = "";
  for (const b of bytes) bits += b.toString(2).padStart(8, "0");
  for (let i = 0; i < bits.length; i += 5) out += B32[parseInt(bits.slice(i, i + 5).padEnd(5, "0"), 2)];
  return out;
}

/** Code à 6 chiffres pour le pas de 30 s `step` (= Math.floor(secondes / 30)). */
export async function totpAt(secret, step, digits = 6) {
  const key = await crypto.subtle.importKey("raw", base32Decode(secret), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const msg = new ArrayBuffer(8); new DataView(msg).setUint32(4, step >>> 0); new DataView(msg).setUint32(0, Math.floor(step / 2 ** 32));
  const h = new Uint8Array(await crypto.subtle.sign("HMAC", key, msg));
  const o = h[19] & 15;
  const n = ((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 10 ** digits).padStart(digits, "0");
}

/** Renvoie le pas accepté (nombre) si le code est bon à ±1 pas près (décalage d'horloge), sinon null. À l'appelant de refuser un pas déjà utilisé. */
export async function verifyTotp(secret, code, now = Date.now()) {
  const c = String(code || "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(c)) return null;
  const step = Math.floor(now / 30000);
  let found = null;
  for (const d of [0, -1, 1]) { if ((await totpAt(secret, step + d)) === c && found === null) found = step + d; }   // les 3 sont toujours évalués
  return found;
}
