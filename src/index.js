// AI Arcade Worker: comments (Cloudflare Turnstile + moderation), visit counter, admin. Everything else is served from ./public.
import { createComments } from "../worker/comments.js";
import { createAdmin } from "../worker/admin.js";
import { createVisits } from "../worker/visits.js";
import { createChat, buildSystemPrompt } from "../worker/chat.js";
import { SITE_NAME, KNOWLEDGE } from "../worker/chat-knowledge.js";

const LANGS = ["en", "fr", "es", "pt", "de", "it", "ar", "zh"];  // keep in sync with i18n.py
const comments = createComments({ languages: LANGS, defaultLang: "en", modelLang: { en: "english", fr: "french", es: "spanish", pt: "portuguese", de: "german", it: "italian", ar: "arabic", zh: "chinese" },
  maxName: 40, maxMessage: 1000, minMessage: 20, minWords: 3, rateLimit: 3, rateWindowMin: 10, likeLimitPerHour: 60, ipRetentionDays: 90 });
const visits = createVisits({ cookie: "aa" });
const LANG_NAMES = { en: "English", fr: "French", es: "Spanish", pt: "Portuguese", de: "German", it: "Italian", ar: "Arabic", zh: "Chinese" };
const chat = createChat({ languages: LANGS, defaultLang: "en", langNames: LANG_NAMES, cookie: "aa_chat", model: "claude-haiku-5-5", maxTokens: 400, maxChars: 500, perVisitorPerHour: 20, perDay: 300,
  system: (lang, langName) => buildSystemPrompt({ siteName: SITE_NAME, knowledge: KNOWLEDGE, langName }) });
const admin = createAdmin({ cookie: "aa_admin" });

const json = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });

export default {
  async scheduled(event, env, ctx) {
    if (env.DB) ctx.waitUntil(Promise.all([comments.purgeIps(env), visits.purge(env), chat.purge(env)]));
  },
  async fetch(request, env, ctx) {
    const url = new URL(request.url), path = url.pathname;
    if (!path.startsWith("/api/")) return env.ASSETS.fetch(request);
    if (!env.DB) return json({ error: "not_configured" }, 503);
    try {
      if (path === "/api/visit") return await visits.handleVisit(request, env);
      if (path === "/api/comments" && request.method === "GET") return await comments.list(request, env);
      if (path === "/api/comments" && request.method === "POST") return await comments.post(request, env, url, ctx);
      if (path === "/api/comments/like" && request.method === "POST") return await comments.toggleLike(request, env, url);
      if (path === "/api/chat" && request.method === "GET") return chat.status(env);
      if (path === "/api/chat" && request.method === "POST") return await chat.post(request, env, url);
      if (path === "/api/translate" && request.method === "GET") return await comments.translate(request, env, url);
      if (path.startsWith("/api/admin/")) return await admin.route(request, env, url, { comments, visits });
      return json({ error: "not_found" }, 404);
    } catch (e) { console.log("error", path, String(e)); return json({ error: "server" }, 500); }
  },
};
