// Chat assistant widget (vanilla JS, no dependency). Works with worker/src/chat.js.
// Use: window.SK_CHAT = { sitekey, lang, endpoint:"/api/chat", t:{ open, title, placeholder, send, hello, note, close, error, limit, busy, challenge, starters:[...] } }; then <script src="/assets/sitekit-chat.js" defer>
// Colours come from CSS variables with fallbacks: --panel, --ink, --mute, --line, --amber. Nothing is stored in the browser; the conversation lives in memory only.
(() => {
  const C = window.SK_CHAT; if (!C) return;
  const t = Object.assign({ open: "Ask the assistant", title: "Assistant", placeholder: "Ask a question", send: "Send", hello: "Hello! Ask me anything about this site.", note: "AI assistant. Answers may contain mistakes. Messages are not stored.",
    close: "Close", error: "Something went wrong. Please try again.", limit: "You have reached the hourly limit. Please try again later.", busy: "The assistant is resting for today. Please come back tomorrow.", challenge: "Verification failed. Please reload the page.", starters: [] }, C.t || {});
  const lang = C.lang || document.documentElement.lang || "en", endpoint = C.endpoint || "/api/chat";
  const el = (tag, a = {}, ...k) => { const n = document.createElement(tag); for (const [x, v] of Object.entries(a)) x in n ? (n[x] = v) : n.setAttribute(x, v); n.append(...k); return n; };
  const css = el("style", {}, `
.skc-btn{position:fixed;inset-block-end:16px;inset-inline-end:16px;z-index:50;display:flex;gap:8px;align-items:center;font:600 14px var(--body,system-ui);color:#0b0f14;background:var(--amber,#ffb703);border:0;border-radius:24px;padding:12px 16px;cursor:pointer;box-shadow:0 4px 18px rgba(0,0,0,.4)}
.skc-panel{position:fixed;inset-block-end:16px;inset-inline-end:16px;z-index:51;width:min(380px,calc(100vw - 24px));height:min(560px,calc(100dvh - 24px));display:none;flex-direction:column;background:var(--panel,#121a24);color:var(--ink,#e8eef5);border:1px solid var(--line,#2a3646);border-radius:10px;box-shadow:0 10px 40px rgba(0,0,0,.55);font:400 15px/1.4 var(--body,system-ui)}
.skc-panel.on{display:flex}
.skc-panel header{display:flex;justify-content:space-between;align-items:center;padding:10px 12px;border-bottom:1px solid var(--line,#2a3646);font-weight:600}
.skc-panel header button{background:transparent;border:0;color:var(--ink,#e8eef5);font-size:22px;line-height:1;cursor:pointer;padding:4px 8px}
.skc-log{flex:1;overflow:auto;padding:12px;display:flex;flex-direction:column;gap:8px}
.skc-m{max-width:88%;padding:8px 11px;border-radius:10px;white-space:pre-wrap;overflow-wrap:anywhere}
.skc-m.u{align-self:flex-end;background:var(--amber,#ffb703);color:#0b0f14}.skc-m.a{align-self:flex-start;background:rgba(255,255,255,.07)}
.skc-m.w{opacity:.6}
.skc-st{display:flex;flex-wrap:wrap;gap:6px}.skc-st button{font:400 13px var(--body,system-ui);color:var(--ink,#e8eef5);background:transparent;border:1px solid var(--line,#2a3646);border-radius:14px;padding:5px 10px;cursor:pointer;text-align:start}
.skc-note{margin:0;padding:0 12px 6px;font-size:12px;color:var(--mute,#9aa8b8)}
.skc-form{display:flex;gap:6px;padding:8px 10px 10px;border-top:1px solid var(--line,#2a3646)}
.skc-form input{flex:1;min-width:0;font:400 16px var(--body,system-ui);color:var(--ink,#e8eef5);background:rgba(0,0,0,.25);border:1px solid var(--line,#2a3646);border-radius:6px;padding:9px 10px}
.skc-form button{font:600 13px var(--body,system-ui);letter-spacing:.08em;text-transform:uppercase;color:#0b0f14;background:var(--amber,#ffb703);border:0;border-radius:6px;padding:0 14px;cursor:pointer}
.skc-form button:disabled{opacity:.5}
.skc-btn:focus-visible,.skc-panel button:focus-visible,.skc-form input:focus-visible{outline:2px solid #fff;outline-offset:2px}
@media (prefers-reduced-motion:no-preference){.skc-panel.on{animation:skc .15s ease-out}@keyframes skc{from{opacity:0;transform:translateY(8px)}}}`);
  const open = el("button", { className: "skc-btn", type: "button", "aria-haspopup": "dialog" }, "💬 ", el("span", {}, t.open));
  const log = el("div", { className: "skc-log", role: "log", "aria-live": "polite" });
  const input = el("input", { type: "text", maxLength: 500, placeholder: t.placeholder, "aria-label": t.placeholder, autocomplete: "off" });
  const send = el("button", { type: "submit" }, t.send);
  const form = el("form", { className: "skc-form" }, input, send);
  const x = el("button", { type: "button", "aria-label": t.close }, "×");
  const panel = el("section", { className: "skc-panel", role: "dialog", "aria-label": t.title }, el("header", {}, el("span", {}, t.title), x), log, el("p", { className: "skc-note" }, t.note), form);
  fetch(endpoint).then((r) => r.json()).then((d) => { if (d && d.ready) { document.head.append(css); document.body.append(open, panel); } }).catch(() => {});   // stays hidden until the server has its API key
  const history = []; let busy = false, tsReady = null, tsWidget = null, greeted = false;
  const add = (cls, text) => { const m = el("div", { className: "skc-m " + cls }, text); log.append(m); log.scrollTop = log.scrollHeight; return m; };
  function show() { panel.classList.add("on"); open.style.display = "none"; if (!greeted) { greeted = true; add("a", t.hello); if (t.starters.length) { const s = el("div", { className: "skc-st" }); t.starters.forEach((q) => s.append(el("button", { type: "button", onclick: () => { s.remove(); ask(q); } }, q))); log.append(s); } } input.focus(); }
  function hide() { panel.classList.remove("on"); open.style.display = ""; open.focus(); }
  open.onclick = show; x.onclick = hide; panel.addEventListener("keydown", (e) => { if (e.key === "Escape") hide(); });

  function challenge() { // Turnstile in "interaction-only" mode: invisible unless the visitor must prove they are human
    if (!C.sitekey) return Promise.resolve("");
    if (!tsReady) tsReady = new Promise((ok, ko) => { // reuse Turnstile if the page already loads it (e.g. the comment form)
      if (!document.querySelector('script[src*="challenges.cloudflare.com/turnstile"]')) document.head.append(el("script", { src: "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit", async: true }));
      let n = 0; const iv = setInterval(() => { if (window.turnstile && window.turnstile.render) { clearInterval(iv); ok(); } else if (++n > 100) { clearInterval(iv); ko(new Error("ts")); } }, 100);
    });
    return tsReady.then(() => new Promise((ok, ko) => {
      const box = el("div"); panel.append(box);
      tsWidget = window.turnstile.render(box, { sitekey: C.sitekey, appearance: "interaction-only", callback: (tok) => { ok(tok); setTimeout(() => box.remove(), 100); }, "error-callback": () => ko(new Error("ts")) });
    }));
  }
  let verified = false;
  async function call(token) {
    const r = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: history, lang, token }) });
    let d = {}; try { d = await r.json(); } catch {}
    return { status: r.status, d };
  }
  async function ask(text) {
    text = String(text || "").trim(); if (!text || busy) return;
    busy = true; send.disabled = true; input.value = ""; add("u", text); history.push({ role: "user", content: text });
    const wait = add("a w", "…");
    try {
      let res = await call(verified ? "" : await challenge());
      if (res.status === 403 && res.d.error === "challenge" && verified) res = await call(await challenge());   // session expired: verify again once
      wait.remove();
      if (res.status === 200 && res.d.reply) { verified = true; history.push({ role: "assistant", content: res.d.reply }); add("a", res.d.reply); }
      else { history.pop(); add("a", res.status === 429 ? (res.d.error === "busy" ? t.busy : t.limit) : res.status === 403 ? t.challenge : t.error); }
    } catch { wait.remove(); history.pop(); add("a", t.error); }
    busy = false; send.disabled = false; input.focus();
  }
  form.onsubmit = (e) => { e.preventDefault(); ask(input.value); };
})();
