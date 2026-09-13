<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Repo facts

Scraper web app for Racing Club (Argentina) news + fixtures. No DB, no env vars, no tests. Everything lives in `app/`:

- `app/page.tsx` — client component that calls our own API routes.
- `app/api/noticias/racing/route.js` — scrapes `ole.com.ar/racing` with cheerio, then fetches each article body (`#storyBody`, clipped at "Mirá también"). Cached 60s via `next.revalidate`.
- `app/api/calendario/racing/route.js` — fetches ESPN via the `https://r.jina.ai/<url>` reader proxy (ESPN blocks direct scraping with AWS WAF). Parses the embedded `"events":[...]` JSON by string-slicing the HTML to get real ISO dates; verifies match rows by `data-testid` selectors. Cached 3600s.

Commands: `npm run dev`, `npm run build`, `npm run lint` (eslint). No test/typecheck script.

Gotchas:
- Code, comments, and UI text are in Spanish — keep new code that way.
- API route files are plain `.js` (not `.ts`) even though the rest of the app is TS.
- Both scrapers depend on live third-party HTML/markup; failures are usually upstream site changes, not code bugs. The `"events"` slice + JSON.parse and the `data-testid` selectors are the brittle parts.
- Scraping is slow and network-dependent — don't run both routes' full path in loops (noticias fetches up to 20 article pages in parallel).
