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
- `mcp__playwright__*` — all Playwright browser tools

**Nice to have:**
- `WebFetch(domain:metabase.com)` — for consulting docs
- `WebFetch(domain:linear.app)` — for Linear context

Report which permissions are present, which are missing, and suggest the additions.

### 3. Mage commands available

Run each of these and verify they don't error on startup (check exit code, don't worry about the output content):
- `./bin/mage -bot-server-info` — should print server config
- `./bin/mage -bot-api-call /api/health` — may fail if backend isn't running, but should at least resolve the port and attempt the call (exit 1 with "Connection failed" is OK, but a Clojure compilation error is not)
- `./bin/mage -bot-git-readonly git status` — should print git status
- `./bin/mage -bot-fetch-issue TEST 2>&1` — should fail with "Invalid issue identifier" or "LINEAR_API_KEY not set", not a compilation error

### 4. Backend server (optional)

Run `./bin/mage -bot-api-call /api/health` and check the response.
- If it returns `{"status":"ok"}` — backend is running, ready for full QA
- If it fails with connection error — warn that backend must be running before `/qabot` is invoked
- This is informational, not blocking for the precheck

### 5. clojure-eval skill (optional)

Check if the `/clojure-eval` skill is available by looking for it in the skill list. If not available, warn that REPL-based verification (server restart, log capture, function testing) won't be possible.

### 6. PDF generation

Run `npx -y md-to-pdf --version` to verify the PDF generator is available via npx.

### 7. Linear API key (optional)

Check if `LINEAR_API_KEY` is set in the environment (via `./bin/mage -bot-server-info` output). If not, warn that Linear context won't be available but qabot can still run.

## Report format

Print a summary like:

```
QABot Precheck Results
======================

[PASS] Playwright MCP configured in .mcp.json
[PASS] Claude permissions: Read, Grep, Glob, Write, Skill, Bash(*), mcp__playwright__*
[PASS] Mage commands: -bot-server-info, -bot-api-call, -bot-git-readonly, -bot-fetch-issue
[PASS] PDF generation (md-to-pdf via npx)
[WARN] Backend not running (start it before running /qabot)
[WARN] LINEAR_API_KEY not set (qabot will skip Linear context)
[WARN] /clojure-eval skill not available (REPL testing disabled)

Ready to run /qabot: YES (with warnings above)
```

If any required check fails (Playwright, permissions, mage commands), report:
```
Ready to run /qabot: NO — fix the issues above first
```
