Run a precheck to verify the environment is correctly configured for `/qabot` to work — both inline and autobot mode. Report what's ready and what needs fixing.

**Common check definitions are in [shared/bot-precheck-common.md](shared/bot-precheck-common.md).** Read that file first, then run each referenced check as described there.

## Checks

### 1. Playwright MCP configuration
Run the **Playwright MCP configuration** check from the shared file, using bot name `qabot`.

### 2. Claude permissions

Read `.claude/settings.local.json` if it exists. Check that the permissions include all of the following (or a wildcard that covers them):

**Required permissions:**
- `Read` — code analysis
- `Grep` — code search
- `Glob` — file search
- `Write` — output files to `.bot/qabot/`
- `Skill` — `/clojure-eval` for REPL access
- `Bash(./bin/mage *)` or `Bash(*)` — mage wrapper commands
- `Bash(npx -y @playwright/mcp*)` or `Bash(npx *)` or `Bash(*)` — Playwright CLI commands
- `Bash(npx -y md-to-pdf *)` or `Bash(npx *)` or `Bash(*)` — PDF generation
- `Bash(clj-nrepl-eval *)` or `Bash(*)` — REPL access for dynamic verification
- `mcp__playwright__*` — all Playwright browser tools

**Nice to have:**
- `WebFetch(domain:metabase.com)` — for consulting docs
- `WebFetch(domain:linear.app)` — for Linear context

Report which permissions are present, which are missing, and suggest the additions.

### 3. Worktree setup hook
Run the **Worktree setup hook** check from the shared file.

### 4. clj-nrepl-eval installed
Run the **clj-nrepl-eval installed** check from the shared file. This is **required** for qabot.

### 5. PDF generation

Run `npx -y md-to-pdf --version` to verify the PDF generator is available via npx.

**IMPORTANT:** Run this as a standalone command — do not append `; echo ...` or other shell constructs, as this may not match the user's permission globs.

### 6. Server info and environment
Run the **Server info and environment** check from the shared file. Also check for **LINEAR_API_KEY** (optional, warn if missing).

## Report format

Print a summary like:

```
QABot Precheck Results
======================

[PASS] Playwright MCP configured in .mcp.json
[PASS] Claude permissions: Read, Grep, Glob, Write, Skill, Bash(mage/npx/clj-nrepl-eval), mcp__playwright__*
[PASS] Worktree hook: .husky/local/post-checkout exists
[PASS] clj-nrepl-eval installed
[PASS] PDF generation (md-to-pdf via npx)
[PASS] Server info: config file with users and API keys
[WARN] LINEAR_API_KEY not set (qabot will skip Linear context)

Ready to run /qabot: YES (with warnings above)
```

If any required check fails (Playwright, permissions, PDF generation, server info config), report:
```
Ready to run /qabot: NO — fix the issues above first
```
