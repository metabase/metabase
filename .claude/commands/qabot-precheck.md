Run a precheck to verify the environment is correctly configured for `/qabot` to work — both inline and workmux mode. Report what's ready and what needs fixing.

## Checks

### 1. Playwright MCP configuration

Read `.mcp.json` in the project root.

**Check:** Does it exist?
**Check:** Does it contain a `playwright` entry in `mcpServers`?
**Check:** Is the playwright version pinned to `@playwright/mcp@0.0.68`?
**Check:** Is it configured with `--headless`, `--browser chrome`, `--viewport-size 1440x900`, `--snapshot-mode full`, `--isolated`?

If `.mcp.json` is missing or doesn't have playwright, report the exact file to create:
```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["-y", "@playwright/mcp@0.0.68", "--headless", "--browser", "chrome", "--viewport-size", "1440x900", "--snapshot-mode", "full", "--block-service-workers", "--isolated", "--timeout-action", "10000"]
    }
  }
}
```

### 2. Claude permissions

Read `.claude/settings.local.json` if it exists. Check that the permissions include all of the following (or a wildcard that covers them):

**Required permissions:**
- `Read` — code analysis
- `Grep` — code search
- `Glob` — file search
- `Write` — output files to `.qabot/`
- `Skill` — `/clojure-eval` for REPL access
- `Bash(./bin/mage *)` or `Bash(*)` — mage wrapper commands
- `Bash(npx -y @playwright/mcp*)` or `Bash(npx *)` or `Bash(*)` — Playwright CLI commands
- `Bash(npx -y md-to-pdf *)` or `Bash(npx *)` or `Bash(*)` — PDF generation
- `mcp__playwright__*` — all Playwright browser tools

**Nice to have:**
- `WebFetch(domain:metabase.com)` — for consulting docs
- `WebFetch(domain:linear.app)` — for Linear context

Report which permissions are present, which are missing, and suggest the additions.

### 3. clojure-eval skill (optional)

Check if the `/clojure-eval` skill is available by looking for it in the skill list. If not available, warn that REPL-based verification (server restart, log capture, function testing) won't be possible.

### 4. PDF generation

Run `npx -y md-to-pdf --version` to verify the PDF generator is available via npx.

**IMPORTANT:** Run this as a standalone command — do not append `; echo ...` or other shell constructs, as this may not match the user's permission globs.

### 5. Server info and environment

Run `./bin/mage -bot-server-info` (standalone, no shell chaining) and check the output for:

**Required:**
- **Config file**: The output should reference a config file (e.g., `local/config.yml`) that defines at least one user and at least one API key. If the config section is missing or has no users/api-keys, report as a failure — qabot needs pre-configured users and API keys to authenticate.

**Optional:**
- **LINEAR_API_KEY**: Check if it appears in the output. If not set, warn that Linear context won't be available but qabot can still run.

## Report format

Print a summary like:

```
QABot Precheck Results
======================

[PASS] Playwright MCP configured in .mcp.json
[PASS] Claude permissions: Read, Grep, Glob, Write, Skill, Bash(mage/npx), mcp__playwright__*
[PASS] PDF generation (md-to-pdf via npx)
[PASS] Server info: config file with users and API keys
[WARN] LINEAR_API_KEY not set (qabot will skip Linear context)
[WARN] /clojure-eval skill not available (REPL testing disabled)

Ready to run /qabot: YES (with warnings above)
```

If any required check fails (Playwright, permissions, PDF generation, server info config), report:
```
Ready to run /qabot: NO — fix the issues above first
```
