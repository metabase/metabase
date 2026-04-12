## Initial Setup

1. If you have not already, read `CLAUDE.md` in the project root for test commands and conventions.
2. Read `.bot/autobot/llm-status.txt` using the `Read` tool. **You must do this before any `Write` to that file** — the Write tool requires a prior Read on existing files.
3. Wait for backend: run `./bin/mage -bot-preflight-health` (retries for up to 5 minutes). If it times out, **STOP and tell the user** to check the backend logs.
4. Load Playwright MCP tools:
   ```
   ToolSearch: select:mcp__playwright__browser_navigate,mcp__playwright__browser_snapshot,mcp__playwright__browser_click,mcp__playwright__browser_fill,mcp__playwright__browser_type,mcp__playwright__browser_press_key,mcp__playwright__browser_hover,mcp__playwright__browser_take_screenshot,mcp__playwright__browser_close,mcp__playwright__browser_evaluate,mcp__playwright__browser_console_messages,mcp__playwright__browser_network_requests
   ```
   If ToolSearch says "MCP servers still connecting," wait 10 seconds and retry up to 3 times. If it still fails, **STOP and tell the user**: "Playwright MCP tools are not available."

## Fail-Fast on Tool Issues

If any of these fail during setup or at any point, **STOP immediately** and tell the user what you tried and what failed. Do NOT attempt to fix infrastructure — the user is responsible for providing a working environment.

- Playwright MCP tools unavailable or erroring → STOP
- Backend server not responding to health check → STOP
- API calls returning connection errors → STOP
- nREPL not responding (shows `NONE` in server info) → STOP
- Linear API unreachable → continue without Linear context (optional)

## Output and Work Directory

Your base output directory is `{{OUTPUT_DIR}}`. Use this path for ALL output files.

Even temporary files should go in `{{OUTPUT_DIR}}/tmp`

## Discover Environment & Instance Setup

Run `./bin/mage -bot-server-info` to discover everything about the running instance:
- **Ports**: Jetty backend, frontend dev server, nREPL, database
- **Config file**: path and contents (users, passwords, API keys)
- **Environment variables**: edition, tokens, connection URIs

Do NOT hardcode ports, credentials, or API key values — always discover them from `-bot-server-info`.

Use `http://localhost:$MB_JETTY_PORT` for all API calls and browser navigation. The instance auto-creates users and API keys on first startup via the config file — no manual setup or `/api/setup` calls needed.

## REPL Access

The backend runs an nREPL server.

The nREPL port is reported by `./bin/mage -bot-server-info` under "nREPL Servers". If it says `NONE`, there is no running REPL — **STOP and tell the user** to start the backend before continuing.

Use nREPL for:
- Evaluating Clojure expressions against the running backend
- Requiring namespaces with `:reload` to pick up code changes
- Testing functions interactively
- Checking compilation

Send **one expression per eval call**. Multi-expression evals frequently timeout. Split into separate (parallel if independent) calls.

```bash
clj-nrepl-eval -p $DISCOVERED_PORT "(+ 1 2)"
```



## Database Access

The app database connection URI is in `MB_DB_CONNECTION_URI` (from `-bot-server-info`). Always interact with the database through Clojure JDBC via the REPL — do NOT use `psql`, `mysql`, or other CLI database tools.

```clojure
;; Query the app database
(require '[toucan2.core :as t2])
(t2/select :model/Card :id 1)

;; Raw SQL when needed
(t2/query "SELECT id, name FROM report_card LIMIT 5")
```

## Log Access

### View and capture logs (REPL)

```clojure
(require '[metabase.logger.core :as logger])
(logger/messages)                                         ;; last 250 log entries
(logger/set-ns-log-level! 'metabase.some-ns :debug)       ;; increase verbosity
(logger/set-ns-log-level! 'metabase.some-ns :info)        ;; reset
```

Levels (least→most verbose): `:off` `:fatal` `:error` `:warn` `:info` `:debug` `:trace`

Or via API: `./bin/mage -bot-api-call /api/logger/logs --api-key $ADMIN_API_KEY`

**Workflow:** Set debug level → reproduce issue → capture logs → reset level.

Use logs for:
- Debugging startup failures (check if backend/frontend started successfully)
- Looking for error messages or stack traces
- Verifying that your code changes were picked up by hot reload

Save logs as evidence:
```clojure
(spit "{{OUTPUT_DIR}}/output/server-logs-CONTEXT.txt"
      (->> (logger/messages)
           (map #(str (:timestamp %) " " (:level %) " [" (:fqns %) "] " (:msg %)))
           (clojure.string/join "\n")))
```

## Status Tracking

Write to `.bot/autobot/llm-status.txt` when your status changes meaningfully. This is displayed in a status pane visible to the user. Examples:
- "Analyzing diff"
- "Reproducing issue"
- "Writing tests"
- "Waiting for CI"
- "Blocked: <what's blocking>"

**Rules:**
- Keep it to **1-3 short lines** — the pane is small
- Only update when visible state meaningfully changes — don't spam
- Overwrite the whole file each time

## Minimizing Permission Prompts

Bash commands can trigger permission prompts that slow you down. Prefer tools and wrappers that are auto-allowed:

| Instead of... | Use... | Why |
|---|---|---|
| `git diff`, `git log`, `git status`, `gh pr view` | `./bin/mage -bot-git-readonly git ...` / `gh ...` | Auto-allowed, blocks writes |
| `curl` for API calls | `./bin/mage -bot-api-call` | Auto-allowed, auto-discovers port |
| `npx -y md-to-pdf` | `./bin/mage -bot-md-to-pdf` | Auto-allowed |
| `cat`, `head`, `tail` | `Read` tool | Never prompts |
| `echo > file`, `cat > file` | `Write` tool | Never prompts |
| `grep`, `rg` | `Grep` tool | Never prompts |
| `find`, `ls` | `Glob` tool | Never prompts |

When you must use bash, keep each command simple and standalone — do NOT chain commands with `&&`, `;`, or `|` as this creates compound commands that won't match permission globs like `Bash(./bin/mage *)`.

**Sandbox TLS errors:** Commands that access `api.github.com` or `registry.npmjs.org` may fail with TLS certificate errors (`x509: OSStatus -26276`) inside the sandbox. If `./bin/mage -bot-git-readonly gh ...` or `./bin/mage -bot-md-to-pdf` fail with TLS errors, retry with `dangerouslyDisableSandbox: true`. This is expected in sandboxed environments.

**PDF generation:** `./bin/mage -bot-md-to-pdf` uses `npx -y md-to-pdf` which may download the package from npm on first run. If the sandbox blocks `registry.npmjs.org`, use `dangerouslyDisableSandbox: true`.

### GitHub API Workaround

If `gh` commands fail with `tls: failed to verify certificate: x509` errors, switch to using `curl` with `gh auth token` for the rest of the session. For example, to create a PR:
```bash
curl -s -X POST https://api.github.com/repos/metabase/metabase/pulls \
  -H "Authorization: token $(gh auth token)" \
  -H "Accept: application/vnd.github+json" \
  -d '{ "title": "...", "head": "branch-name", "base": "master", "body": "..." }'
```
Use the same pattern for any other `gh` operations (e.g., `gh pr view` → `curl -s https://api.github.com/repos/metabase/metabase/pulls/NUMBER ...`).
