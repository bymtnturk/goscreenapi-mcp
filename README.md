# GoScreenAPI MCP Server

Give your AI assistant the ability to **screenshot, analyze, and verify any website** — directly from the chat. A [Model Context Protocol](https://modelcontextprotocol.io) server that connects [GoScreenAPI](https://goscreenapi.com) to Claude Desktop, Cursor, Cline, Windsurf, Continue, and any other MCP-compatible client.

[![npm version](https://img.shields.io/npm/v/@goscreenapi/mcp-server.svg)](https://www.npmjs.com/package/@goscreenapi/mcp-server)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

## What you can ask your AI

> "Take a full-page screenshot of stripe.com/pricing and compare it with square.com/pricing — tell me which one mentions 'no hidden fees'."

> "Is github.com down right now? If yes, when was the last successful check?"

> "What CMS does vercel.com use, and is their SSL certificate expiring soon?"

> "Capture the current state of these 12 competitor landing pages and save the URLs to a markdown table."

> "Render this Notion page as a PDF and embed it in our changelog."

The MCP server exposes the full GoScreenAPI capability set as 7 typed tools the AI can call autonomously.

---

## Quick start

### 1. Get an API key

Sign up at [goscreenapi.com](https://goscreenapi.com) (free tier includes 100 screenshots/month) and grab a key from the [API Keys dashboard](https://goscreenapi.com/dashboard/api-keys).

### 2. Add to your MCP client config

#### Claude Desktop

Open `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows) and add:

```json
{
  "mcpServers": {
    "goscreenapi": {
      "command": "npx",
      "args": ["-y", "@goscreenapi/mcp-server"],
      "env": {
        "GOSCREENAPI_KEY": "sk_your_key_here"
      }
    }
  }
}
```

Restart Claude Desktop. The 7 tools should appear in the 🔨 menu.

#### Cursor

Open Cursor settings → MCP → Add server, then paste the same JSON snippet above.

#### Cline / Continue / Windsurf

All use the same MCP config schema. Refer to your client's MCP docs for the config file location and add the snippet under `mcpServers`.

### 3. Try it

Ask the AI:

```
Take a screenshot of news.ycombinator.com at 1920x1080 viewport.
```

The AI will call the `screenshot` tool and reply with a CDN link.

---

## Available tools

| Tool | What it does |
|---|---|
| `screenshot` | Capture any URL → PNG / JPEG / WebP / PDF. Custom viewport, full-page, dark mode, ad blocking, custom user agent. |
| `site_report` | Detected tech stack (CMS, server, CDN, frameworks, JS libs), SSL info, DNS records, page-speed rating, SEO meta tags. |
| `uptime_check` | Live HTTP probe. Returns status code, response time in ms, SSL validity. |
| `compare_screenshots` | Two URLs side-by-side, parallel capture. Perfect for staging vs production, competitor pages, before vs after redesigns. |
| `render_pdf` | Render a URL to PDF. A4 / Letter / Legal / Tabloid, landscape, custom scale. |
| `batch_screenshots` | Up to 50 URLs in parallel. Waits for completion (max 90s) and returns all results. |
| `account_info` | Current API account: plan name, usage quotas, remaining credits. Useful before launching a large batch. |

Run `account_info` first if you want the AI to plan around your quota.

---

## Configuration

| Env var | Required | Default | Description |
|---|---|---|---|
| `GOSCREENAPI_KEY` | yes | — | API key from your dashboard |
| `GOSCREENAPI_BASE_URL` | no | `https://goscreenapi.com` | Override for white-label deploys or local dev |

---

## Example prompts

### Visual diffing during code review

```
Compare https://staging.acme.com/dashboard with https://acme.com/dashboard
at 1440px width, full page. Tell me what visual differences you can identify.
```

### Tech stack research

```
For each of these competitors, tell me their CMS, CDN, and SSL issuer:
- vercel.com
- netlify.com
- cloudflare.com
- railway.app
```

### Outage triage

```
Is openai.com down? If it's up, what's the response time? Compare to
anthropic.com and google.com.
```

### Documentation snapshots

```
Take a full-page screenshot of https://docs.stripe.com/api/charges
in dark mode and save the URL. We'll embed it in our migration guide.
```

### Bulk archival

```
Capture screenshots of all 30 URLs in this list and give me a markdown
table with the link to each.
```

---

## Architecture

```
┌──────────────────┐    stdio    ┌──────────────────────┐    HTTPS    ┌──────────────────┐
│  Claude Desktop  │◄──────────►│ goscreenapi-mcp      │◄──────────►│  goscreenapi.com │
│  Cursor / Cline  │   MCP      │ (this package, npx)  │   X-API-Key │  (REST API)      │
└──────────────────┘            └──────────────────────┘             └──────────────────┘
```

The server runs as a short-lived child process spawned by your MCP client. It speaks MCP over stdin/stdout and forwards calls to GoScreenAPI over HTTPS using your API key.

---

## Roadmap

- [ ] `competitor_watch` — detect changes to a competitor's site over time
- [ ] `security_audit` — run an OWASP-style scan and return findings
- [ ] `crawl_site` — full-site crawl with broken-link report
- [ ] `archive_snapshot` — store a permanent timestamped snapshot
- [ ] Image responses (return the actual screenshot bytes, not just a URL — pending MCP image content support in client UIs)

PRs welcome. See the [GoScreenAPI public roadmap](https://goscreenapi.com/changelog) for what's shipping next on the platform side.

---

## Local development

```bash
git clone https://github.com/bymtnturk/goscreenapi-mcp.git
cd goscreenapi-mcp
npm install
npm run build

GOSCREENAPI_KEY=sk_... node dist/index.js
```

Use the [MCP Inspector](https://github.com/modelcontextprotocol/inspector) to interactively test tools without a chat client:

```bash
npx @modelcontextprotocol/inspector node dist/index.js
```

---

## License

MIT — see [LICENSE](LICENSE).

Built and maintained by the team at [GoScreenAPI](https://goscreenapi.com). Issues and PRs welcome.
