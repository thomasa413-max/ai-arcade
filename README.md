# AI Arcade site (EN/FR, comments, free hosting)

Folder map: `public/` = the site (built), `src/index.js` + `worker/` = comments and moderation API, `wrangler.jsonc` = Cloudflare config, `build_site.py` = rebuilds `public/` (needs `../build`, `../site`; ignore if you only edit `public/`).

## One-time setup (about 20 minutes, all free tier)
1. **GitHub**: create a repo and upload this folder's contents.
2. **Cloudflare → Storage & databases → D1 → Create** a database named `ai-arcade`. Copy its ID into `wrangler.jsonc` (`database_id`). Tables are created automatically on first use.
3. **Cloudflare → Turnstile → Add widget** (managed mode), with your domain. You get a **site key** (public) and a **secret key** (private).
4. **Cloudflare → Workers & Pages → Create → Import a repository** → pick the repo. Deploy.
5. In the Worker's **Settings → Variables and secrets**, add these as *secrets*, typed by you in the Cloudflare page, never in code or chat:
   - `TURNSTILE_SECRET` = the Turnstile secret key
   - `IP_SALT` = any long random text
   - `ADMIN_PASSWORD_HASH` = output of `node hash-password.mjs "your long password"` (run on a computer)
6. Put the Turnstile **site key** in the pages: `python3 build_site.py --sitekey YOUR_SITE_KEY --base https://your-domain`, commit `public/`, push. (Or search-and-replace `data-sitekey=""` in `public/en/index.html` and `public/fr/index.html`.)
7. **Domain**: Worker → Settings → Domains & Routes → add your custom domain when you buy one. Until then the free `*.workers.dev` address works. Links are relative, so no code changes.

## Chat assistant (Claude)
`/api/chat` answers visitors' questions from `worker/chat-knowledge.js` (edit it when the site changes). Needs one more secret, typed in the Cloudflare page: `ANTHROPIC_API_KEY` (create it in the Anthropic Console with an expiry date and a monthly spend limit). Optional variable `CHAT_MODEL` to change the model (default `claude-haiku-5-5`). Limits: 20 messages per visitor per hour, 300 per day, set in `src/index.js`. Conversations are never stored. Reusable module: `site-kit/worker/src/chat.js` in the Imago Biblia repo.

## Moderating comments
Open `/admin/`, sign in (user `admin` + your password), then Publish or Delete. New comments stay hidden until you publish them. Visits by country are shown too.

## Languages
EN, FR, ES, PT, DE, IT, AR (right-to-left), ZH. To add one: add its translations in `i18n.py` (same order as `KEYS`/`UIK`) and its code to `LANGS` in `src/index.js`, then run `python3 build_site.py`.

## Visitors
Each page shows a visitor counter in the footer. `/admin/` shows countries, devices, operating systems, traffic sources, chosen site language, pages, daily totals and filtered-out bots. No IP address is stored for visits; only daily totals.

## Adding a game
Drop the game's `index.html` in `public/games/<name>/`, then change its card from "Coming soon" to a button in `../build/landing.html` and rebuild.

