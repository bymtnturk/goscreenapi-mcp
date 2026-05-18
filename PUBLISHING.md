# Publishing Guide (for maintainers)

This file documents how to take this package from "code in a subfolder of the main GoScreenAPI repo" to "live on npm + GitHub".

## Option A — Keep inside the main repo (simplest)

1. Build:
   ```bash
   cd goscreenapi-mcp
   npm install
   npm run build
   ```
2. Test locally with the MCP Inspector:
   ```bash
   GOSCREENAPI_KEY=sk_... npx @modelcontextprotocol/inspector node dist/index.js
   ```
3. Publish to npm (you must own the `@goscreenapi` npm scope):
   ```bash
   npm login
   npm publish --access public
   ```

The package will resolve as `@goscreenapi/mcp-server` for end users running `npx -y @goscreenapi/mcp-server`.

## Option B — Promote to its own GitHub repo (recommended for visibility)

A standalone repo gets:
- its own GitHub stars (counts as social proof)
- listing on Anthropic's awesome-mcp-servers list
- a cleaner readme presence on the npm page

Steps:

```bash
# 1. From the main repo, copy the goscreenapi-mcp folder out
cp -r goscreenapi-mcp /tmp/goscreenapi-mcp-standalone
cd /tmp/goscreenapi-mcp-standalone

# 2. Initialize fresh git history
rm -rf .git
git init -b main
git add -A
git commit -m "Initial release: 7 tools, MIT license"

# 3. Create the GitHub repo (requires GitHub CLI: https://cli.github.com)
gh repo create bymtnturk/goscreenapi-mcp \
  --public \
  --source=. \
  --description "MCP server for GoScreenAPI — screenshots, tech stack analysis, uptime checks for Claude/Cursor/Cline" \
  --push

# 4. Tag and release
git tag v0.1.0
git push origin v0.1.0

# 5. Publish to npm
npm install
npm run build
npm publish --access public
```

## Listing on awesome-mcp-servers

After publishing, open a PR to https://github.com/punkpeye/awesome-mcp-servers (the unofficial-but-most-watched MCP server list, ~10k stars). Add an entry under the "Web automation" or "DevTools" section:

```markdown
- [GoScreenAPI](https://github.com/bymtnturk/goscreenapi-mcp) — Capture screenshots, analyze tech stacks, check uptime, and run security audits on any URL.
```

## Anthropic's official MCP server list

Submit at https://github.com/modelcontextprotocol/servers (this is the official list, smaller but higher trust). Open an issue first to get pre-approval, then PR to add your entry.

## Maintenance cadence

- Bump `version` in `package.json` for any change (semver).
- Tag every release: `git tag vX.Y.Z && git push origin vX.Y.Z`.
- Update the `tools` array in `src/index.ts` when adding new capabilities.
- Keep the README "Roadmap" section honest — devs trust repos with realistic roadmaps.
