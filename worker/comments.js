// Commentaires publics avec modération, « j'aime » (un par visiteur, un second clic l'annule), traduction automatique et notification e-mail.
// Protection : Cloudflare Turnstile (anti-robots), champ piège invisible, limite de débit par adresse, contrôle de l'origine.
// Vie privée : l'adresse IP n'est conservée qu'en empreinte salée ; l'adresse brute est effacée après `ipRetentionDays` jours.
// Secrets (à poser dans le tableau de bord de l'hébergeur, jamais dans le code) : TURNSTILE_SECRET, IP_SALT ; optionnels : NOTIFY_TO.
import { json, sha256, sameOrigin, countryOf } from "./common.js";

export const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS comments (
     id INTEGER PRIMARY KEY AUTOINCREMENT, created_at TEXT NOT NULL, name TEXT NOT NULL, message TEXT NOT NULL, lang TEXT NOT NULL,
     hidden INTEGER NOT NULL DEFAULT 0, ip_hash TEXT NOT NULL, ip TEXT, country TEXT)`,
  "CREATE INDEX IF NOT EXISTS idx_comments_created ON comments(created_at)",
  "CREATE TABLE IF NOT EXISTS translations (comment_id INTEGER NOT NULL, lang TEXT NOT NULL, text TEXT NOT NULL, PRIMARY KEY (comment_id, lang))",
  "CREATE TABLE IF NOT EXISTS comment_likes (comment_id INTEGER NOT NULL, voter TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY (comment_id, voter))",
  "CREATE INDEX IF NOT EXISTS idx_likes_voter ON comment_likes(voter, created_at)",
];

function clean(text, max) {
  return String(text || "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, max);
}

async function verifyTurnstile(token, ip, secret) {
  if (!token || !secret) return false;
  const body = new FormData();
  body.append("secret", secret); body.append("response", token);
  if (ip) body.append("remoteip", ip);
  const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body });
  return r.ok && (await r.json()).success === true;
}

/**
 * @param {object} opts
 * @param {string[]} opts.languages            codes de langue acceptés (ex. ["fr","en"])
 * @param {string}   opts.defaultLang
 * @param {Object<string,string>} [opts.modelLang]  code → nom de langue pour le modèle de traduction (ex. {fr:"french"})
 * @param {number}   [opts.maxName=60] [opts.maxMessage=2000] [opts.minMessage=5] [opts.minWords=2]
 * @param {number}   [opts.rateLimit=3] [opts.rateWindowMin=10] [opts.likeLimitPerHour=60] [opts.ipRetentionDays=90]
 * @param {(env, comment) => Promise<void>} [opts.notify]  appelé en arrière-plan à chaque nouveau commentaire (ex. envoi d'e-mail)
 */
export function createComments(opts) {
  const o = { maxName: 60, maxMessage: 2000, minMessage: 5, minWords: 2, rateLimit: 3, rateWindowMin: 10, likeLimitPerHour: 60, ipRetentionDays: 90, ...opts };
  let ready = false;
  async function ensureSchema(db) {
    if (ready) return;
    await db.batch(SCHEMA.map((s) => db.prepare(s)));
    ready = true;
  }
  const voterOf = (request, env) => sha256("like:" + (env.IP_SALT || "") + (request.headers.get("CF-Connecting-IP") || ""));
  const readJson = async (request) => { try { return await request.json(); } catch { return null; } };

  async function list(request, env) {
    await ensureSchema(env.DB);
    const voter = await voterOf(request, env);
    const { results } = await env.DB.prepare(
      `SELECT c.id, c.created_at, c.name, c.message, c.lang, c.country,
         (SELECT COUNT(*) FROM comment_likes l WHERE l.comment_id = c.id) AS likes,
         EXISTS (SELECT 1 FROM comment_likes l WHERE l.comment_id = c.id AND l.voter = ?) AS liked
       FROM comments c WHERE c.hidden = 0 ORDER BY c.id DESC LIMIT 200`).bind(voter).all();
    return json({ comments: results });
  }

  async function post(request, env, url, ctx) {
    if (!sameOrigin(request, url)) return json({ error: "origin" }, 403);
    await ensureSchema(env.DB);
    const data = await readJson(request);
    if (!data) return json({ error: "invalid" }, 400);
    if (data.website) return json({ error: "invalid" }, 400);   // champ piège : seuls les robots le remplissent
    const lang = o.languages.includes(data.lang) ? data.lang : o.defaultLang;
    const name = clean(data.name, o.maxName).replace(/\s+/g, " ");
    const message = clean(data.message, o.maxMessage);
    if (name.length < 2) return json({ error: "name" }, 400);
    if (message.length < o.minMessage || message.split(/\s+/).filter((w) => /\p{L}{2,}/u.test(w)).length < o.minWords) return json({ error: "empty" }, 400);
    const ip = request.headers.get("CF-Connecting-IP") || "";
    if (!(await verifyTurnstile(data.token, ip, env.TURNSTILE_SECRET))) return json({ error: "captcha" }, 403);
    const ipHash = await sha256((env.IP_SALT || "") + ip);
    const recent = await env.DB.prepare("SELECT COUNT(*) AS n FROM comments WHERE ip_hash = ? AND created_at > ?")
      .bind(ipHash, new Date(Date.now() - o.rateWindowMin * 60000).toISOString()).first();
    if (recent && recent.n >= o.rateLimit) return json({ error: "rate" }, 429);
    const created = new Date().toISOString(), country = countryOf(request);
    // En attente de validation (hidden = 1) : visible seulement après modération.
    const row = await env.DB.prepare("INSERT INTO comments (created_at, name, message, lang, hidden, ip_hash, ip, country) VALUES (?, ?, ?, ?, 1, ?, ?, ?) RETURNING id")
      .bind(created, name, message, lang, ipHash, ip || null, country).first();
    if (o.notify && ctx) ctx.waitUntil(o.notify(env, { id: row.id, created_at: created, name, message, lang, ip, country }));
    return json({ pending: true }, 201);
  }

  async function toggleLike(request, env, url) {
    if (!sameOrigin(request, url)) return json({ error: "origin" }, 403);
    await ensureSchema(env.DB);
    const data = await readJson(request), id = Number(data && data.id);
    if (!Number.isInteger(id)) return json({ error: "invalid" }, 400);
    if (!(await env.DB.prepare("SELECT 1 AS ok FROM comments WHERE id = ? AND hidden = 0").bind(id).first())) return json({ error: "not_found" }, 404);
    const voter = await voterOf(request, env);
    const existing = await env.DB.prepare("SELECT 1 AS ok FROM comment_likes WHERE comment_id = ? AND voter = ?").bind(id, voter).first();
    if (existing) {
      await env.DB.prepare("DELETE FROM comment_likes WHERE comment_id = ? AND voter = ?").bind(id, voter).run();
    } else {
      const recent = await env.DB.prepare("SELECT COUNT(*) AS n FROM comment_likes WHERE voter = ? AND created_at > ?").bind(voter, new Date(Date.now() - 3600000).toISOString()).first();
      if (recent && recent.n >= o.likeLimitPerHour) return json({ error: "rate" }, 429);
      await env.DB.prepare("INSERT OR IGNORE INTO comment_likes (comment_id, voter, created_at) VALUES (?, ?, ?)").bind(id, voter, new Date().toISOString()).run();
    }
    const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM comment_likes WHERE comment_id = ?").bind(id).first();
    return json({ likes: row ? row.n : 0, liked: !existing });
  }

  /** Traduction à la demande vers la langue du lecteur (Workers AI), mise en cache en base. */
  async function translate(request, env, url) {
    if (!env.AI) return json({ error: "not_configured" }, 503);
    await ensureSchema(env.DB);
    const id = Number(url.searchParams.get("id")), to = url.searchParams.get("to");
    if (!Number.isInteger(id) || !o.languages.includes(to)) return json({ error: "invalid" }, 400);
    const c = await env.DB.prepare("SELECT message, lang FROM comments WHERE id = ? AND hidden = 0").bind(id).first();
    if (!c) return json({ error: "not_found" }, 404);
    if (c.lang === to) return json({ text: c.message, cached: true });
    const cached = await env.DB.prepare("SELECT text FROM translations WHERE comment_id = ? AND lang = ?").bind(id, to).first();
    if (cached) return json({ text: cached.text, cached: true });
    const names = o.modelLang || {};
    const out = await env.AI.run("@cf/meta/m2m100-1.2b", { text: c.message, source_lang: names[c.lang] || c.lang, target_lang: names[to] || to });
    const text = clean(out && out.translated_text, o.maxMessage * 2);
    if (!text) return json({ error: "server" }, 502);
    await env.DB.prepare("INSERT OR REPLACE INTO translations (comment_id, lang, text) VALUES (?, ?, ?)").bind(id, to, text).run();
    return json({ text, cached: false });
  }

  // ---- Modération (l'appelant vérifie l'autorisation avant d'appeler ces fonctions : voir admin.js)
  async function purgeIps(env) {
    await ensureSchema(env.DB);
    await env.DB.prepare("UPDATE comments SET ip = NULL WHERE ip IS NOT NULL AND created_at < ?").bind(new Date(Date.now() - o.ipRetentionDays * 86400000).toISOString()).run();
  }
  async function adminList(env) {
    await ensureSchema(env.DB);
    await purgeIps(env);
    const { results } = await env.DB.prepare(
      `SELECT c.id, c.created_at, c.name, c.message, c.lang, c.hidden, c.ip, c.country,
         (SELECT COUNT(*) FROM comment_likes l WHERE l.comment_id = c.id) AS likes FROM comments c ORDER BY c.id DESC LIMIT 500`).all();
    let notify = null;   // dernier résultat de la notification e-mail (voir notify.js)
    try {
      const row = await env.DB.prepare("SELECT value FROM settings WHERE name = 'notify_status'").first();
      if (row) notify = JSON.parse(row.value);
    } catch { /* table pas encore créée */ }
    return json({ comments: results, notify });
  }
  async function adminSetHidden(request, env, url) {
    if (!sameOrigin(request, url)) return json({ error: "origin" }, 403);
    const data = await readJson(request), id = Number(data && data.id);
    if (!Number.isInteger(id)) return json({ error: "invalid" }, 400);
    await ensureSchema(env.DB);
    await env.DB.prepare("UPDATE comments SET hidden = ? WHERE id = ?").bind(data.hidden ? 1 : 0, id).run();
    return json({ ok: true });
  }
  async function adminDelete(request, env, url) {
    if (!sameOrigin(request, url)) return json({ error: "origin" }, 403);
    const data = await readJson(request), id = Number(data && data.id);
    if (!Number.isInteger(id)) return json({ error: "invalid" }, 400);
    await ensureSchema(env.DB);
    await env.DB.batch([
      env.DB.prepare("DELETE FROM translations WHERE comment_id = ?").bind(id),
      env.DB.prepare("DELETE FROM comment_likes WHERE comment_id = ?").bind(id),
      env.DB.prepare("DELETE FROM comments WHERE id = ?").bind(id),
    ]);
    return json({ ok: true });
  }

  return { ensureSchema, list, post, toggleLike, translate, purgeIps, adminList, adminSetHidden, adminDelete };
}
