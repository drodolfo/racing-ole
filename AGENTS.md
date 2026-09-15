<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Repo facts

Scraper web app for Racing Club (Argentina) news + fixtures. No DB, no env vars, no tests. Everything lives in `app/`:

- `app/page.tsx` — client component that calls our own API routes.
- `app/api/noticias/racing/route.js` — scrapes `ole.com.ar/racing` with cheerio, then fetches each article body (`#storyBody`, clipped at "Mirá también"). Cached 60s via `next.revalidate`.
- `app/api/calendario/racing/route.js` — fetches the ESPN fixtures page (`espndeportes.espn.com/futbol/equipo/calendario/_/id/15/racing-club`) via the `https://r.jina.ai/<url>` reader proxy (ESPN blocks HTML scraping with AWS WAF). Tries `X-Return-Format: html` first; jina often returns the WAF challenge page for that format, so it detects the WAF markers and falls back to the default **markdown** format, which does pass and renders the fixtures table (`| Dom., 27 de Sep. | TeamA | [v] | TeamB | hora | Liga | |`, col A = local team). Parsed with `extraerPartidosMarkdown` (table preferred over the embedded `"events":[...]` JSON, which lags and misses matches). Always `cache: 'no-store'` (kept uncached on purpose so the refresh button returns live data).

Commands: `npm run dev`, `npm run build`, `npm run lint` (eslint). No test/typecheck script.

Gotchas:
- Code, comments, and UI text are in Spanish — keep new code that way.
- API route files are plain `.js` (not `.ts`) even though the rest of the app is TS.
- Both scrapers depend on live third-party APIs/HTML; failures are usually upstream site changes, not code bugs. The calendar's zero-result cause was the jina proxy returning an AWS WAF challenge page instead of ESPN content. Note: ESPN's schedule *JSON API* (`site.api.espn.com/.../teams/15/schedule`) lags behind the fixtures page and misses upcoming matches — prefer the jina **markdown** fixtures table over both the JSON API and the embedded `"events"` HTML JSON.
- Scraping is slow and network-dependent — don't run both routes' full path in loops (noticias fetches up to 20 article pages in parallel).
