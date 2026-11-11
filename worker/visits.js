// Compteur de visiteurs + statistiques par jour, pays, page, langue, provenance et appareil (et nombre de robots écartés, par raison).
// Respect de la vie privée : jamais d'adresse IP ni d'identifiant stocké, uniquement des totaux par jour.
// Un « visiteur » = un navigateur (cookie), compté une fois par jour dans les statistiques et une fois pour toujours dans le compteur global.
import { json, countryOf, deviceOf, osOf, refererHost, today, daysAgo } from "./common.js";

// Robots : mots courants + outils d'automatisation, de surveillance et d'aperçu de liens.
const BOT_UA = new RegExp([
  "bot", "crawl", "spider", "slurp", "headless", "lighthouse", "preview", "facebookexternalhit", "curl", "wget", "python", "monitor",
  "ahrefs", "semrush", "mj12", "petal", "yandex", "baidu", "ia_archiver", "archive\\.org", "uptime", "pingdom", "gtmetrix", "pagespeed", "inspectiontool",
  "node-fetch", "axios", "go-http-client", "java/", "libwww", "scrapy", "httpx", "aiohttp", "okhttp", "apache-httpclient", "postman", "insomnia",
  "phantomjs", "playwright", "puppeteer", "selenium", "webdriver", "screenshot", "validator", "feedfetcher", "feedly", "embedly",
  "statuscake", "datadog", "newrelic", "site24x7", "zgrab", "nmap", "masscan", "sqlmap", "nikto", "ccbot", "facebot",
].join("|"), "i");

// Réseaux d'hébergeurs (numéros AS) : un vrai lecteur n'arrive pas depuis un serveur. Les VPN grand public n'y figurent pas.
export const DATACENTER_ASNS = [
  16509, 14618,   // Amazon (AWS)
  396982,         // Google Cloud
  8075,           // Microsoft (Azure)
  14061,          // DigitalOcean
  16276,          // OVH
  24940,          // Hetzner
  45102,          // Alibaba Cloud
  132203, 45090,  // Tencent Cloud
  31898,          // Oracle Cloud
  63949,          // Linode (Akamai)
  20473,          // Vultr
  36351,          // IBM Cloud (SoftLayer)
  12876,          // Scaleway
  51167,          // Contabo
];

export const SCHEMA = [
  "CREATE TABLE IF NOT EXISTS counters (name TEXT PRIMARY KEY, value INTEGER NOT NULL)",
  `CREATE TABLE IF NOT EXISTS visit_stats (
     day TEXT NOT NULL, kind TEXT NOT NULL, key TEXT NOT NULL, n INTEGER NOT NULL,
     PRIMARY KEY (day, kind, key))`,
];

/**
 * @param {object} opts
 * @param {string}  [opts.cookie="sk"]        préfixe des cookies (sk_v = déjà venu, sk_d = déjà compté aujourd'hui)
 * @param {RegExp}  [opts.pathPattern]        chemins comptés ; le 1er groupe est la langue (défaut : /fr/…, /en/…)
 * @param {string[]}[opts.excludePrefixes]    chemins jamais comptés (défaut : ["/admin"])
 * @param {number}  [opts.retentionDays=400]  durée de conservation des totaux par jour
 * @param {number[]}[opts.datacenterAsns]    réseaux d'hébergeurs écartés (défaut : DATACENTER_ASNS ; [] pour désactiver)
 * @param {object}  [opts.deviceLabels]       noms des appareils dans les statistiques (défaut : tablet, mobile, desktop ; imagobiblia.org : tablette, mobile, ordinateur)
 */
export function createVisits(opts = {}) {
  const cookie = opts.cookie || "sk";
  const pathPattern = opts.pathPattern || /^\/([a-z]{2})\/[^?#]*$/;
  const exclude = opts.excludePrefixes || ["/admin"];
  const retention = opts.retentionDays || 400;
  const labels = Object.assign({ tablet: "tablet", mobile: "mobile", desktop: "desktop" }, opts.deviceLabels || {});
  const asns = new Set(opts.datacenterAsns || DATACENTER_ASNS);
  let ready = false;

  /** Pourquoi cette requête n'est pas un lecteur ? "" = lecteur ; sinon la raison (agent, entete, hebergeur). */
  function botReason(request, ua) {
    if (!/^Mozilla\//.test(ua) || BOT_UA.test(ua)) return "agent";   // tous les navigateurs commencent par Mozilla/
    const site = request.headers.get("Sec-Fetch-Site"), mode = request.headers.get("Sec-Fetch-Mode"), origin = request.headers.get("Origin");
    if ((site && site !== "same-origin") || (mode && mode !== "cors")) return "entete";   // pas un appel de la page elle-même
    if (origin) { try { if (new URL(origin).host !== new URL(request.url).host) return "entete"; } catch { return "entete"; } }
    const cf = request.cf || {};
    if (cf.botManagement && cf.botManagement.verifiedBot) return "agent";
    if (cf.asn && asns.has(Number(cf.asn))) return "hebergeur";
    return "";
  }

  async function ensureSchema(db) {
    if (ready) return;
    await db.batch(SCHEMA.map((s) => db.prepare(s)));
    ready = true;
  }

  /** POST {path, ref} depuis le navigateur : compte la vue. GET : lit seulement le compteur. */
  async function handleVisit(request, env) {
    await ensureSchema(env.DB);
    const cookies = request.headers.get("Cookie") || "";
    const known = new RegExp(`(?:^|;\\s*)${cookie}_v=1`).test(cookies);
    const day = today();
    const seenToday = new RegExp(`(?:^|;\\s*)${cookie}_d=${day}`).test(cookies);
    const ua = request.headers.get("User-Agent") || "";
    const extra = [];
    let row;
    if (request.method === "POST") {
      let data = {};
      try { data = await request.json(); } catch { /* corps vide */ }
      const url = new URL(request.url);
      const path = String(data.path || "").slice(0, 120);
      const m = path.match(pathPattern);
      const bot = botReason(request, ua);
      if (m && bot && !exclude.some((p) => path.startsWith(p))) {
        // robot qui exécute le script : on ne compte pas la visite, on note seulement la raison (total par jour, rien de personnel)
        await env.DB.prepare(
          "INSERT INTO visit_stats (day, kind, key, n) VALUES (?, 'bot', ?, 1) ON CONFLICT(day, kind, key) DO UPDATE SET n = n + 1"
        ).bind(day, bot).run();
      } else if (m && !exclude.some((p) => path.startsWith(p))) {
        const ref = data.ref ? refererHost(String(data.ref), url.hostname) : "direct";
        const stmts = [];
        const up = (kind, key) => stmts.push(env.DB.prepare(
          "INSERT INTO visit_stats (day, kind, key, n) VALUES (?, ?, ?, 1) ON CONFLICT(day, kind, key) DO UPDATE SET n = n + 1"
        ).bind(day, kind, key));
        up("views", ""); up("page", path); up("lang", m[1]);
        const seg = path.split("/")[2];
        if (seg) up("book", m[1] + "/" + seg.slice(0, 60));   // « langue/livre » : le tableau de bord regroupe ensuite les langues par livre
        if (!seenToday) {
          up("visitors", ""); up("country", countryOf(request) || "??");
          if (ref) up("referrer", ref);
          up("device", labels[deviceOf(ua)]);
          up("os", osOf(ua));
          if (!known) up("new", "");
          extra.push(`${cookie}_d=${day}; Path=/; Max-Age=86400; SameSite=Lax; Secure; HttpOnly`);
        }
        await env.DB.batch(stmts);
        if (!known) {
          row = await env.DB.prepare(
            "INSERT INTO counters (name, value) VALUES ('visitors', 1) ON CONFLICT(name) DO UPDATE SET value = value + 1 RETURNING value"
          ).first();
          extra.push(`${cookie}_v=1; Path=/; Max-Age=31536000; SameSite=Lax; Secure; HttpOnly`);
        }
      }
    }
    if (!row) row = await env.DB.prepare("SELECT value FROM counters WHERE name = 'visitors'").first();
    const res = json({ visitors: row ? row.value : 0 });
    for (const c of extra) res.headers.append("Set-Cookie", c);
    return res;
  }

  /** Tableau de bord : totaux par jour + classements (pays, pages, provenance, appareils, systèmes, langues). `authorize` décide qui peut lire. */
  async function handleStats(request, env, url, authorize) {
    if (!(await authorize(request, env))) return json({ error: "unauthorized" }, 401);
    await ensureSchema(env.DB);
    const days = Math.min(400, Math.max(1, Number(url.searchParams.get("days")) || 30));
    const since = daysAgo(days - 1);
    const { results: daily } = await env.DB.prepare(
      "SELECT day, kind, SUM(n) AS n FROM visit_stats WHERE day >= ? AND kind IN ('views','visitors','new') GROUP BY day, kind ORDER BY day"
    ).bind(since).all();
    const top = {};
    for (const kind of ["country", "page", "referrer", "device", "os", "lang", "bot", "book"]) {
      const { results } = await env.DB.prepare(
        "SELECT key, SUM(n) AS n FROM visit_stats WHERE day >= ? AND kind = ? GROUP BY key ORDER BY n DESC LIMIT " + (kind === "book" ? 1500 : 25)
      ).bind(since, kind).all();
      top[kind] = results;
    }
    const all = await env.DB.prepare("SELECT value FROM counters WHERE name = 'visitors'").first();
    return json({ days, since, daily, top, allTime: all ? all.value : 0 });
  }

  /** À appeler depuis le cron quotidien. */
  async function purge(env) {
    await ensureSchema(env.DB);
    await env.DB.prepare("DELETE FROM visit_stats WHERE day < ?").bind(daysAgo(retention)).run();
  }

  return { ensureSchema, handleVisit, handleStats, purge };
}
