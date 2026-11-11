// AI Arcade admin: sign in, visitors (countries, devices, systems, sources, languages, pages), comment moderation. No visitor IPs are stored.
(() => {
  const root = document.getElementById("admin"); if (!root) return;
  const el = (t, a = {}, ...k) => { const n = document.createElement(t); for (const [x, v] of Object.entries(a)) x in n ? (n[x] = v) : n.setAttribute(x, v); n.append(...k); return n; };
  const api = (u, m = "GET", b) => fetch(u, { method: m, headers: { "Content-Type": "application/json" }, body: b ? JSON.stringify(b) : undefined });
  let region; try { region = new Intl.DisplayNames(["en"], { type: "region" }); } catch { region = null; }
  const cname = (c) => { if (c === "??") return "Unknown"; try { return (region && region.of(c)) || c; } catch { return c; } };
  const flag = (c) => /^[A-Z]{2}$/.test(c) ? String.fromCodePoint(...[...c].map((x) => 127397 + x.charCodeAt(0))) + " " : "";
  let days = 30;

  function loginView() {
    const u = el("input", { name: "user", value: "admin", autocomplete: "username" }), p = el("input", { name: "password", type: "password", placeholder: "Password", autocomplete: "current-password" });
    const msg = el("p", { role: "alert" }), f = el("form", {}, u, p, el("button", {}, "Sign in"), msg);
    f.onsubmit = async (e) => { e.preventDefault(); const r = await api("/api/admin/login", "POST", { user: u.value, password: p.value });
      if (r.ok) return dash(); msg.textContent = r.status === 429 ? "Too many attempts, try later." : "Invalid credentials."; };
    root.replaceChildren(el("h1", {}, "AI Arcade admin"), f);
  }
  const bars = (rows, label) => {
    const total = rows.reduce((a, r) => a + r.n, 0) || 1, max = Math.max(1, ...rows.map((r) => r.n));
    return el("table", {}, ...rows.map((r) => el("tr", {}, el("td", {}, label(r.key)),
      el("td", { style: "width:55%" }, el("div", { style: `background:#ffb02e;height:10px;width:${Math.max(2, 100 * r.n / max)}%` })),
      el("td", { style: "text-align:right" }, `${r.n} (${Math.round(100 * r.n / total)}%)`))));
  };
  const section = (title, node) => el("section", {}, el("h2", {}, title), node);

  async function dash() {
    const [s, c] = await Promise.all([api(`/api/admin/stats?days=${days}`), api("/api/admin/comments")]);
    if (s.status === 401) return loginView();
    const st = await s.json(), cs = c.ok ? (await c.json()).comments : [], top = st.top || {};
    const sum = (k) => st.daily.filter((d) => d.kind === k).reduce((a, d) => a + d.n, 0);
    const out = el("button", {}, "Sign out"); out.onclick = async () => { await api("/api/admin/logout", "POST"); loginView(); };
    const sel = el("select", {}, ...[7, 30, 90, 365].map((n) => el("option", { value: n, selected: n === days }, `Last ${n} days`))); sel.onchange = () => { days = +sel.value; dash(); };
    const kpi = el("p", {}, el("strong", {}, `${st.allTime}`), " unique visitors ever · ", el("strong", {}, `${sum("visitors")}`), " visitor-days · ", el("strong", {}, `${sum("views")}`), " page views · ", el("strong", {}, `${sum("new")}`), " new visitors in this period");
    const daily = {}; for (const d of st.daily) (daily[d.day] ||= {})[d.kind] = d.n;
    const rows = Object.keys(daily).sort().reverse().slice(0, 14).map((k) => el("tr", {}, el("td", {}, k), el("td", {}, String(daily[k].visitors || 0)), el("td", {}, String(daily[k].views || 0))));
    const pending = cs.filter((m) => m.hidden).length;
    const list = el("div", {}, ...cs.map((m) => {
      const hide = el("button", {}, m.hidden ? "Publish" : "Hide"), del = el("button", {}, "Delete");
      hide.onclick = async () => { await api("/api/admin/comments", "POST", { id: m.id, hidden: !m.hidden }); dash(); };
      del.onclick = async () => { if (confirm("Delete this comment?")) { await api("/api/admin/comments", "DELETE", { id: m.id }); dash(); } };
      return el("article", {}, el("strong", {}, `${m.name} · ${flag(m.country)}${cname(m.country || "??")} · ${m.lang} · ${m.created_at.slice(0, 16)}${m.hidden ? " · PENDING" : ""}`), el("p", { style: "white-space:pre-wrap" }, m.message), hide, del);
    }));
    root.replaceChildren(el("h1", {}, "AI Arcade admin"), out, " ", sel, kpi,
      section("Where visitors come from (countries)", bars(top.country || [], (k) => flag(k) + cname(k))),
      section("Devices", bars(top.device || [], (k) => k)),
      section("Operating systems", bars(top.os || [], (k) => k)),
      section("Traffic sources", bars(top.referrer || [], (k) => k === "direct" ? "Direct / unknown" : k)),
      section("Site language chosen", bars(top.lang || [], (k) => k)),
      section("Pages", bars(top.page || [], (k) => k)),
      section("Last 14 days", el("table", {}, el("tr", {}, el("th", {}, "Day"), el("th", {}, "Visitors"), el("th", {}, "Views")), ...rows)),
      section(`Comments (${pending} pending)`, list),
      section("Automated traffic filtered out", bars(top.bot || [], (k) => k)));
  }
  dash();
})();
