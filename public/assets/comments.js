// Page de commentaires : liste, formulaire (Turnstile + champ piège), « j'aime », traduction à la demande.
// Utilisation : <div id="comments" data-sitekey="…" data-lang="fr"></div> puis <script src="/assets/comments.js" defer>.
// Textes : window.SK_COMMENTS = {send:"Envoyer", pending:"Merci ! Votre message sera publié après validation.", …}
(() => {
  const root = document.getElementById("comments"); if (!root) return;
  const lang = root.dataset.lang || document.documentElement.lang || "en";
  const T = Object.assign({ name: "Name", message: "Message", send: "Send", pending: "Thank you! Your message will appear after review.",
    error: "Something went wrong, please try again.", translate: "Translate", original: "Show original", empty: "No comments yet.", like: "Like" }, window.SK_COMMENTS || {});
  const el = (t, a = {}, ...k) => { const n = document.createElement(t); for (const [x, v] of Object.entries(a)) x in n ? (n[x] = v) : n.setAttribute(x, v); n.append(...k); return n; };
  const post = (u, b) => fetch(u, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) });
  const list = el("div", { className: "sk-comments" }), form = el("form", { className: "sk-comment-form" });
  const name = el("input", { name: "name", required: true, maxLength: 40, placeholder: T.name, "aria-label": T.name, autocomplete: "name" });
  const msg = el("textarea", { name: "message", required: true, maxLength: 1000, rows: 4, placeholder: T.message, "aria-label": T.message });
  const trap = el("input", { name: "website", tabIndex: -1, autocomplete: "off", className: "sk-trap", "aria-hidden": "true" });
  const ts = el("div", { className: "cf-turnstile" }); ts.dataset.sitekey = root.dataset.sitekey || "";
  const btn = el("button", { type: "submit" }, T.send), note = el("p", { role: "status" });
  form.append(name, msg, trap, ts, btn, note); root.append(form, list);
  if (root.dataset.sitekey) document.head.append(el("script", { src: "https://challenges.cloudflare.com/turnstile/v0/api.js", async: true, defer: true }));

  function card(c) {
    const text = el("p", { className: "sk-text" }, c.message), orig = c.message;
    const like = el("button", { type: "button", className: "sk-like", "aria-pressed": String(!!c.liked), "aria-label": T.like }, "♥ ", el("span", {}, String(c.likes)));
    like.onclick = async () => { const r = await post("/api/comments/like", { id: c.id }); if (r.ok) { const d = await r.json(); like.lastChild.textContent = d.likes; like.setAttribute("aria-pressed", String(d.liked)); } };
    const tr = el("button", { type: "button", className: "sk-translate" }, T.translate); let shown = false;
    tr.onclick = async () => {
      if (shown) { text.textContent = orig; tr.textContent = T.translate; shown = false; return; }
      const r = await fetch(`/api/translate?id=${c.id}&to=${encodeURIComponent(lang)}`);
      if (r.ok) { text.textContent = (await r.json()).text; tr.textContent = T.original; shown = true; }
    };
    const actions = el("div", { className: "sk-actions" }, like); if (c.lang !== lang) actions.append(tr);
    return el("article", { className: "sk-comment" }, el("header", {}, el("strong", {}, c.name), " ", el("time", { dateTime: c.created_at }, c.created_at.slice(0, 10))), text, actions);
  }
  async function load() {
    const r = await fetch("/api/comments"); list.replaceChildren();
    const cs = r.ok ? (await r.json()).comments : [];
    list.append(...(cs.length ? cs.map(card) : [el("p", {}, T.empty)]));
  }
  form.onsubmit = async (e) => {
    e.preventDefault(); btn.disabled = true; note.textContent = "";
    const token = (form.querySelector('[name="cf-turnstile-response"]') || {}).value || "";
    const r = await post("/api/comments", { name: name.value, message: msg.value, website: trap.value, lang, token });
    note.textContent = r.ok ? T.pending : T.error; if (r.ok) form.reset(); btn.disabled = false;
    if (window.turnstile) try { window.turnstile.reset(); } catch {}
  };
  load();
})();
