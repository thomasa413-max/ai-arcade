#!/usr/bin/env python3
"""Builds the multilingual AI Arcade site into ./public.
Usage: python3 build_site.py [--base https://your-domain] [--sitekey TURNSTILE_SITE_KEY]
- English is the template (../build/landing.html); other languages are exact-string translations below.
- To add a language: add an entry to LANGS and a dict to TR (English segment -> translation), then rebuild.
"""
import argparse, pathlib, shutil, re

ap = argparse.ArgumentParser()
ap.add_argument("--base", default="")
ap.add_argument("--sitekey", default="")
a = ap.parse_args()

HERE = pathlib.Path(__file__).resolve().parent
SRC = HERE.parent / "build" / "landing.html"
OUT = HERE / "public"
KIT = HERE.parent / "imagobiblia" / "site-kit" / "static"
DEFAULT = "en"
import i18n
LANGS = i18n.LANGS
TR = {l: dict(zip(i18n.KEYS, v)) for l, v in i18n.TR.items()}
UI = {l: dict(zip(i18n.UIK, v)) for l, v in i18n.UI.items()}
CSS = """
[dir=rtl] *{letter-spacing:0!important}
.langs{display:flex;flex-wrap:wrap;gap:6px;justify-content:flex-end;padding-top:12px}
.langs a{font:600 12px var(--body);letter-spacing:.14em;text-decoration:none;padding:4px 9px;border:1px solid var(--line);color:var(--mute);border-radius:2px}
.langs a[aria-current=true]{border-color:var(--amber);color:var(--amber)}
.sk-comment-form{display:grid;gap:10px;max-width:640px;margin-bottom:22px}
.sk-comment-form input,.sk-comment-form textarea{width:100%;font:400 16px var(--body);background:var(--panel);color:var(--ink);border:1px solid var(--line);padding:10px 12px;border-radius:2px}
.sk-comment-form input:focus-visible,.sk-comment-form textarea:focus-visible,.sk-comment-form button:focus-visible{outline:2px solid var(--amber);outline-offset:2px}
.sk-comment-form button{justify-self:start;font:600 14px var(--body);letter-spacing:.14em;text-transform:uppercase;padding:11px 18px;background:var(--amber);color:#0b0f14;border:0;cursor:pointer}
.sk-comment-form button:disabled{opacity:.5}
.sk-trap{position:absolute!important;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none}.sk-comment-form{position:relative}
.sk-comments{display:grid;gap:12px;max-width:760px}
.sk-comment{background:var(--panel);border:1px solid var(--line);padding:12px 14px}
.sk-comment header{color:var(--mute);font-size:14px}.sk-comment header strong{color:var(--ink)}
.sk-text{margin:6px 0;white-space:pre-wrap;overflow-wrap:anywhere}
.sk-actions{display:flex;gap:10px}
.sk-actions button{font:600 13px var(--body);background:transparent;color:var(--mute);border:1px solid var(--line);padding:5px 10px;cursor:pointer;border-radius:2px}
.sk-actions button[aria-pressed=true]{color:var(--amber);border-color:var(--amber)}
@media (max-width:480px){.langs{justify-content:flex-start}}
.scroller th:first-child,.scroller td:first-child{position:sticky;inset-inline-start:0;background:var(--panel);min-width:132px;z-index:1;box-shadow:1px 0 0 var(--line)}
.scroller th{white-space:normal;min-width:84px;vertical-align:bottom}
"""

def esc(s): return s.replace("\\", "\\\\").replace('"', '\\"')

def build(lang):
    h = SRC.read_text(encoding="utf-8")
    h = h.replace("{{HB}}", "../games/hive-breach/?lang=" + lang).replace("{{RR}}", "../games/relic-run/?lang=" + lang).replace("{{BRIEF}}", "../brief/")
    h = h.replace("Every game is original, runs in the browser on phone and desktop, and is a single page with its own sound. Games unlock here as they are finished.",
                  "Every game is original, runs in the browser on any device, in landscape and portrait, and is a single page with its own sound. Games unlock here as they are finished.")
    h = h.replace("The same requirements for every platform: one HTML file, touch and keyboard, sound, one complete level.",
                  "The same requirements for every platform: one HTML file, touch and keyboard, sound, one complete level, landscape and portrait.")
    if lang != "en":
        for en, tr in sorted(TR[lang].items(), key=lambda kv: -len(kv[0])):
            h = h.replace(en, tr)
    h = h.replace('<html lang="en">', f'<html lang="{lang}"' + (f' dir="{i18n.DIR[lang]}"' if lang in i18n.DIR else "") + ">")
    u = UI[lang]
    links = "".join(f'<link rel="alternate" hreflang="{c}" href="{a.base}/{c}/">' for c in LANGS) + f'<link rel="alternate" hreflang="x-default" href="{a.base}/{DEFAULT}/">' if a.base else ""
    h = h.replace("</style>", CSS + "</style>").replace("</head>", links + "</head>")
    switch = '<nav class="langs" aria-label="%s">%s</nav>' % (u["language"], "".join(
        f'<a href="../{c}/" hreflang="{c}" lang="{c}"{" aria-current=\"true\"" if c == lang else ""}>{n}</a>' for c, n in LANGS.items()))
    h = h.replace('<header class="marquee"><div class="wrap">', '<header class="marquee"><div class="wrap">' + switch, 1)
    texts = "window.SK_COMMENTS={" + ",".join(f'{k}:"{esc(u[k])}"' for k in ("send","name","message","pending","error","translate","original","empty","like")) + "};"
    comments = (f'<section aria-labelledby="cm"><h2 id="cm">{u["comments"]}</h2><p class="sub">{u["csub"]}</p>'
                f'<div id="comments" data-sitekey="{a.sitekey}" data-lang="{lang}"></div></section>\n')
    h = h.replace("</main>", comments + "</main>")
    h = h.replace('<footer><div class="wrap">', '<footer><div class="wrap">\n  <p>%s: <b id="visitor-count">–</b></p>' % u["visitors"])
    h = h.replace("</body>", f'<script>{texts}</script><script src="../assets/comments.js" defer></script><script src="../assets/visits.js" defer></script></body>')
    return h

if OUT.exists(): shutil.rmtree(OUT)
(OUT / "assets").mkdir(parents=True)
for c in LANGS:
    (OUT / c).mkdir(); (OUT / c / "index.html").write_text(build(c), encoding="utf-8")
# comments.js: the kit script, with form placeholders as accessible labels and relative-safe endpoints (absolute /api/... is correct on the deployed domain)
cj = (KIT / "comments.js").read_text(encoding="utf-8")
cj = cj.replace('name = el("input", { name: "name", required: true, maxLength: 60, placeholder: T.name, autocomplete: "name" })',
                'name = el("input", { name: "name", required: true, maxLength: 40, placeholder: T.name, "aria-label": T.name, autocomplete: "name" })')
cj = cj.replace('msg = el("textarea", { name: "message", required: true, maxLength: 2000, rows: 4, placeholder: T.message })',
                'msg = el("textarea", { name: "message", required: true, maxLength: 1000, rows: 4, placeholder: T.message, "aria-label": T.message })')
(OUT / "assets" / "comments.js").write_text(cj, encoding="utf-8")
(OUT / "assets" / "visits.js").write_text((KIT / "visits.js").read_text(encoding="utf-8"), encoding="utf-8")
(OUT / "assets" / "admin.js").write_text((HERE / "admin-dashboard.js").read_text(encoding="utf-8"), encoding="utf-8")
(OUT / "admin").mkdir()
(OUT / "admin" / "index.html").write_text('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Admin</title>'
  '<style>body{font:16px system-ui;max-width:760px;margin:24px auto;padding:0 14px;background:#0b0f14;color:#e8eef5}input,button{font:inherit;padding:8px;margin:4px 4px 4px 0}article{border:1px solid #232e3d;padding:10px;margin:8px 0}table{border-collapse:collapse}td,th{padding:4px 10px;border-bottom:1px solid #232e3d}</style></head>'
  '<body><div id="admin"></div><script src="../assets/admin.js" defer></script></body></html>', encoding="utf-8")
# root: language redirect
import json
root = ('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AI Arcade</title>'
  '<meta http-equiv="refresh" content="2;url=en/"><script>var L=__L__,l=(navigator.language||"en").slice(0,2).toLowerCase();try{l=localStorage.getItem("lang")||l}catch(e){}location.replace((L.indexOf(l)>-1?l:"en")+"/")</script></head>'
  '<body><p>__LINKS__</p></body></html>')
root = root.replace("__L__", json.dumps(list(LANGS))).replace("__LINKS__", " · ".join(f'<a href="{c}/">{n}</a>' for c, n in LANGS.items()))
(OUT / "index.html").write_text(root, encoding="utf-8")
# games + brief
shutil.copytree(HERE.parent / "site" / "games", OUT / "games")
shutil.copytree(HERE.parent / "site" / "brief", OUT / "brief")
(OUT / "brief" / "index.html").write_bytes((HERE.parent / "build" / "brief.html").read_bytes())
# favicon + touch icons on every page
for f in (HERE / "icons").iterdir(): shutil.copy(f, OUT / f.name)
ICONS = ('<link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="icon" href="/favicon.ico" sizes="48x48">'
         '<link rel="apple-touch-icon" href="/apple-touch-icon.png"><link rel="manifest" href="/site.webmanifest"><meta name="theme-color" content="#0b1220">')
for p in OUT.rglob("*.html"):
    t = p.read_text(encoding="utf-8")
    if 'rel="icon"' not in t and "</head>" in t: p.write_text(t.replace("</head>", ICONS + "</head>", 1), encoding="utf-8")
print("built", sorted(str(p.relative_to(OUT)) for p in OUT.rglob("*") if p.is_file()))
