// Espace d'administration : connexion par mot de passe (PBKDF2), session en cookie HttpOnly, limite de tentatives.
// Secrets (tableau de bord de l'hébergeur) : ADMIN_PASSWORD_HASH au format "pbkdf2$<itérations>$<sel hex>$<hash hex>"
// (généré par `node site-kit/tools/hash-password.mjs`), éventuellement ADMIN_USER (défaut "admin").
// Double authentification facultative : si le secret ADMIN_TOTP_SECRET est défini (`node site-kit/tools/totp-secret.mjs`), la connexion exige aussi le code à 6 chiffres.
import { json, sha256, timingSafeEqual, sameOrigin } from "./common.js";
import { verifyTotp } from "./totp.js";

const enc = new TextEncoder();
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
const unhex = (s) => new Uint8Array(s.match(/../g).map((h) => parseInt(h, 16)));

export async function hashPassword(password, iterations = 100000, salt = crypto.getRandomValues(new Uint8Array(16))) {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
  return `pbkdf2$${iterations}$${hex(salt)}$${hex(bits)}`;
}
export async function verifyPassword(password, stored) {
  const p = String(stored || "").split("$");
  if (p.length !== 4 || p[0] !== "pbkdf2") return false;
  const again = await hashPassword(password, Number(p[1]), unhex(p[2]));
  return timingSafeEqual(again, stored);
}

/**
 * @param {object} [opts]
 * @param {string} [opts.cookie="sk_admin"] @param {number} [opts.sessionHours=12] @param {number} [opts.maxFailures=5] @param {number} [opts.lockMinutes=15]
 * @param {boolean} [opts.legacyToken=false]  transition : accepte aussi l'ancien jeton `Authorization: Bearer <ADMIN_TOKEN>` (16 caractères au moins) tant que les anciennes pages d'administration sont en ligne ; à retirer ensuite.
 */
export function createAdmin(opts = {}) {
  const o = { cookie: "sk_admin", sessionHours: 12, maxFailures: 5, lockMinutes: 15, logDays: 365, ...opts };
  let ready = false;
  async function ensureSchema(db) {
    if (ready) return;
    await db.batch([
      db.prepare("CREATE TABLE IF NOT EXISTS admin_sessions (token_hash TEXT PRIMARY KEY, expires_at TEXT NOT NULL)"),
      db.prepare("CREATE TABLE IF NOT EXISTS admin_attempts (ip_hash TEXT NOT NULL, at TEXT NOT NULL)"),
      db.prepare("CREATE TABLE IF NOT EXISTS admin_totp (id INTEGER PRIMARY KEY CHECK (id = 1), last_step INTEGER NOT NULL)"),
      db.prepare("CREATE TABLE IF NOT EXISTS admin_log (id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, action TEXT NOT NULL, target TEXT NOT NULL DEFAULT '', detail TEXT NOT NULL DEFAULT '')"),
    ]);
    ready = true;
  }
  /** Journal des actions de l'administration (connexions, modération). Jamais d'adresse IP ni de mot de passe ; conservé `logDays` jours. */
  async function log(env, action, target = "", detail = "") {
    try {
      await ensureSchema(env.DB);
      await env.DB.batch([
        env.DB.prepare("INSERT INTO admin_log (at, action, target, detail) VALUES (?, ?, ?, ?)").bind(new Date().toISOString(), action, String(target).slice(0, 60), String(detail).slice(0, 200)),
        env.DB.prepare("DELETE FROM admin_log WHERE at < ?").bind(new Date(Date.now() - o.logDays * 86400000).toISOString()),
      ]);
    } catch { /* le journal ne doit jamais bloquer l'action elle-même */ }
  }
  const tokenOf = (request) => ((request.headers.get("Cookie") || "").match(new RegExp("(?:^|; )" + o.cookie + "=([0-9a-f]{64})")) || [])[1];
  const setCookie = (value, maxAge) => `${o.cookie}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;

  async function login(request, env, url) {
    if (!sameOrigin(request, url)) return json({ error: "origin" }, 403);
    if (!env.ADMIN_PASSWORD_HASH) return json({ error: "not_configured" }, 503);
    await ensureSchema(env.DB);
    const ipHash = await sha256("admin:" + (env.IP_SALT || "") + (request.headers.get("CF-Connecting-IP") || ""));
    const since = new Date(Date.now() - o.lockMinutes * 60000).toISOString();
    const f = await env.DB.prepare("SELECT COUNT(*) AS n FROM admin_attempts WHERE ip_hash = ? AND at > ?").bind(ipHash, since).first();
    if (f && f.n >= o.maxFailures) { await log(env, "login_locked", "", "connexion refusée : trop d'échecs récents"); return json({ error: "locked" }, 429); }
    let data; try { data = await request.json(); } catch { data = null; }
    const userOk = timingSafeEqual(String(data && data.user || ""), env.ADMIN_USER || "admin");
    const passOk = await verifyPassword(String(data && data.password || ""), env.ADMIN_PASSWORD_HASH);   // toujours évalué : durée constante
    let totpOk = true, step = null;
    if (env.ADMIN_TOTP_SECRET) {   // 2e facteur : code valide, et jamais deux fois (pas déjà utilisé)
      step = await verifyTotp(env.ADMIN_TOTP_SECRET, data && data.code).catch(() => null);
      const last = (await env.DB.prepare("SELECT last_step FROM admin_totp WHERE id = 1").first())?.last_step || 0;
      totpOk = step !== null && step > last;
    }
    if (!(userOk && passOk && totpOk)) {
      await env.DB.prepare("INSERT INTO admin_attempts (ip_hash, at) VALUES (?, ?)").bind(ipHash, new Date().toISOString()).run();
      await log(env, "login_failed", "", `échec n° ${(f ? f.n : 0) + 1}${userOk && passOk && !totpOk ? " (code de vérification)" : ""}`);
      return json({ error: "credentials" }, 401);   // même réponse quel que soit le facteur faux : rien à deviner
    }
    const token = hex(crypto.getRandomValues(new Uint8Array(32)));
    if (step !== null) await env.DB.prepare("INSERT OR REPLACE INTO admin_totp (id, last_step) VALUES (1, ?)").bind(step).run();
    await env.DB.batch([
      env.DB.prepare("DELETE FROM admin_sessions WHERE expires_at < ?").bind(new Date().toISOString()),
      env.DB.prepare("DELETE FROM admin_attempts WHERE ip_hash = ?").bind(ipHash),
      env.DB.prepare("INSERT INTO admin_sessions (token_hash, expires_at) VALUES (?, ?)").bind(await sha256(token), new Date(Date.now() + o.sessionHours * 3600000).toISOString()),
    ]);
    await log(env, "login", "", "connexion réussie");
    return json({ ok: true }, 200, { "Set-Cookie": setCookie(token, o.sessionHours * 3600) });
  }

  async function logout(request, env) {
    await ensureSchema(env.DB);
    const t = tokenOf(request);
    if (t) await env.DB.prepare("DELETE FROM admin_sessions WHERE token_hash = ?").bind(await sha256(t)).run();
    return json({ ok: true }, 200, { "Set-Cookie": setCookie("", 0) });
  }

  /** À passer comme `authorize` aux modules visits/comments : renvoie true si la session est valide. */
  async function isAuthenticated(request, env) {
    if (o.legacyToken && env.ADMIN_TOKEN && env.ADMIN_TOKEN.length >= 16) {
      const auth = request.headers.get("Authorization") || "";
      if (auth.startsWith("Bearer ") && timingSafeEqual(auth.slice(7), env.ADMIN_TOKEN)) return true;
    }
    const t = tokenOf(request); if (!t || !env.DB) return false;
    await ensureSchema(env.DB);
    const s = await env.DB.prepare("SELECT expires_at FROM admin_sessions WHERE token_hash = ?").bind(await sha256(t)).first();
    return !!s && s.expires_at > new Date().toISOString();
  }

  /**
   * Routeur /api/admin/* : login, logout, session, comments (GET liste, POST masquer/afficher, DELETE), stats, export (sauvegarde, si `backup` est fourni).
   * `comments` et `visits` sont les objets créés par createComments / createVisits.
   */
  async function route(request, env, url, { comments, visits, backup }) {
    const p = url.pathname;
    if (p === "/api/admin/login" && request.method === "POST") return login(request, env, url);
    if (p === "/api/admin/logout" && request.method === "POST") return logout(request, env);
    if (!(await isAuthenticated(request, env))) return json({ error: "unauthorized" }, 401);
    if (p === "/api/admin/session") return json({ ok: true });
    if (p === "/api/admin/comments") {
      if (request.method === "GET") return comments.adminList(env);
      if (request.method === "POST" || request.method === "DELETE") {
        // on note l'action (commentaire masqué, réaffiché ou supprimé) avec un extrait, une fois qu'elle a réussi
        let data = null, who = "";
        try { data = await request.clone().json(); } catch { /* corps invalide : le module répondra */ }
        const id = Number(data && data.id);
        if (Number.isInteger(id)) {
          try { const c = await env.DB.prepare("SELECT name, message FROM comments WHERE id = ?").bind(id).first(); if (c) who = `${c.name} : ${String(c.message).replace(/\s+/g, " ").slice(0, 90)}`; } catch { /* table absente */ }
        }
        const res = request.method === "POST" ? await comments.adminSetHidden(request, env, url) : await comments.adminDelete(request, env, url);
        if (res.ok && Number.isInteger(id)) await log(env, request.method === "DELETE" ? "comment_delete" : (data.hidden ? "comment_hide" : "comment_show"), `#${id}`, who);
        return res;
      }
    }
    if (p === "/api/admin/log" && request.method === "GET") {
      await ensureSchema(env.DB);
      const n = Math.min(Math.max(Number(url.searchParams.get("limit")) || 200, 1), 1000);
      return json({ entries: (await env.DB.prepare("SELECT at, action, target, detail FROM admin_log ORDER BY id DESC LIMIT ?").bind(n).all()).results });
    }
    if (p === "/api/admin/stats" && request.method === "GET") return visits.handleStats(request, env, url, async () => true);
    if (p === "/api/admin/export" && request.method === "GET" && backup) return backup.exportResponse(env);
    return json({ error: "not_found" }, 404);
  }
  return { ensureSchema, login, logout, isAuthenticated, route, log };
}
