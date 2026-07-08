## Initial Setup

1. If you have not already, read `CLAUDE.md` in the project root for test commands and conventions.
2. **Create all directories and files that later steps will Read or Write.** Run this single Bash command up front so the rest of the phases don't trip over missing paths:
   ```bash
   mkdir -p .bot/autobot {{OUTPUT_DIR}}/output {{OUTPUT_DIR}}/tmp && touch .bot/autobot/llm-status.txt
   ```
   - `.bot/autobot/llm-status.txt` is displayed in the status pane in autobot mode. Nothing else creates it, so it must be touched here. In direct-run mode no one reads it but having it present is harmless.
   - `{{OUTPUT_DIR}}/output/` is where Playwright screenshots and API-response captures land. Playwright calls fail with `ENOENT` if this doesn't exist before the first screenshot.
   - `{{OUTPUT_DIR}}/tmp/` is where intermediate files go (prompt fragments, etc).
3. Read `.bot/autobot/llm-status.txt` using the `Read` tool — it now exists (from step 2) so Read will succeed, and this unlocks later `Write` calls to the same file (the Write tool requires a prior Read on existing files).
4. Wait for backend: run `./bin/mage -bot-preflight-health` (retries for up to 5 minutes). If it times out, **STOP and tell the user** to check the backend logs. In PR-env mode the backend is already running remotely; this still works because preflight only polls the health endpoint.
5. Load Playwright MCP tools:
   ```
   ToolSearch: select:mcp__playwright__browser_navigate,mcp__playwright__browser_snapshot,mcp__playwright__browser_click,mcp__playwright__browser_fill,mcp__playwright__browser_type,mcp__playwright__browser_press_key,mcp__playwright__browser_hover,mcp__playwright__browser_take_screenshot,mcp__playwright__browser_close,mcp__playwright__browser_evaluate,mcp__playwright__browser_console_messages,mcp__playwright__browser_network_requests
   ```
   If ToolSearch says "MCP servers still connecting," wait 10 seconds and retry up to 3 times. If it still fails, **STOP and tell the user**: "Playwright MCP tools are not available."

   **Always load Playwright, even for backend-only diffs.** Backend changes can produce surprising frontend behavior — wrong response shapes, broken error flows, changed permissions, auth regressions, etc. Part of your job is to exercise the backend changes through the UI and look for anything a user would find surprising or broken, regardless of whether the diff touches any frontend files.

## Fail-Fast on Tool Issues

If any of these fail during setup or at any point, **STOP immediately** and tell the user what you tried and what failed. Do NOT attempt to fix infrastructure — the user is responsible for providing a working environment.

- Playwright MCP tools unavailable or erroring → STOP
- Backend server not responding to health check → STOP
- API calls returning connection errors → STOP
- nREPL not responding (`-bot-server-info` reports `NREPL_PORT=NONE` AND `.nrepl-port` is absent in the project root) → STOP. **Exception:** in PR-env mode (see below) `NREPL_PORT=NONE` is expected and is NOT a STOP condition — use the socket REPL instead.
- Linear API unreachable → continue without Linear context (optional)

## Remote PR Environment Mode

If `./bin/mage -bot-server-info` prints `MODE=pr-env` in a "Remote PR Environment" section, you are NOT running against a local dev server — you are running against a pre-deployed PR preview environment at a URL like `https://pr383713.coredev.metabase.com`. In this mode:

- **API calls** — use `./bin/mage -bot-api-call` exactly as you would locally. It transparently detects PR-env mode, sends requests to `BASE_URL` from `-bot-server-info`, and authenticates using the cached session token. You do not need to pass `--api-key` or `--base-url`. If the session expires, the wrapper refreshes it automatically on a 401.
- **Browser testing** — Playwright MCP should navigate to `BASE_URL` from `-bot-server-info`, not `http://localhost:*`. The preview site is served over HTTPS; there is no local frontend running.
- **REPL access** — use `./bin/mage -bot-repl-eval '<code>'` as usual. It detects PR-env mode automatically and routes the eval through the remote socket REPL at `repl.coredev.metabase.com:<PR_NUM>`. `clj-nrepl-eval` does NOT work in PR-env mode; the wrapper is your only REPL path. Send **one top-level form per call** — the socket REPL is not session-managed like nREPL. To evaluate multiple forms together, wrap them in `(do ...)`.
- **Database access** — there is no local database. Query data through API endpoints (`/api/dataset`, `/api/card/<id>/query`, `/api/user`, etc.) instead of via Toucan2 in the REPL.
- **Logs** — use `/api/logger/logs` (admin API) instead of REPL-based `(logger/messages)`.
- **Backend restart** — you cannot restart the backend. If you hit a configuration issue that requires a restart, STOP and tell the user.

**Tailscale is required.** PR preview environments are only reachable from the Metabase Tailscale network. If API calls, Playwright navigation, or `nc` hang or time out, the most likely cause is a missing Tailscale connection — tell the user to check their Tailscale status. Do not spend time debugging network issues yourself.

**Destructive tests on shared PR envs.** A PR preview is typically shared with other QA/UX bot sessions and the PR author. Before performing actions that mutate persistent state — disconnecting a provider, deleting a database connection, changing `site-url` or `admin-email`, clearing a cache, dropping a collection, rewriting a permission group, etc. — consider whether the change will affect other users of the env. Prefer read-only verifications or revert-on-exit patterns:

1. **Snapshot first.** Read the current value (e.g. `GET /api/setting/llm-anthropic-api-key`) and store it in `{{OUTPUT_DIR}}/output/` as evidence before mutating.
2. **Mutate.** Perform the test.
3. **Revert.** Restore the original value. Confirm the revert took effect with another GET.
4. **If revert is impossible** (the test destroyed something unrecoverable, like a dropped table or a deleted saved question), **do not perform the test.** Instead, mark the finding `CONFIRMED_STATIC` with a note explaining why dynamic repro was skipped. That is a valid and honest status — do not downgrade it to SUSPECTED just because you couldn't run the destructive test.

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

The backend runs a Clojure REPL — either nREPL or a socket REPL, depending on the mode. Use `./bin/mage -bot-repl-eval '<code>'` as the single canonical wrapper; it auto-detects the right backend and falls back automatically:

```bash
./bin/mage -bot-repl-eval '(+ 1 2)'
```

**Auto-detect order:**
1. **nREPL** via `clj-nrepl-eval` — used when `.nrepl-port` or `clj-nrepl-eval --discover-ports` finds a server. Normal case in local-dev mode.
2. **Socket REPL** via a direct TCP connection — used when nREPL isn't available. The socket REPL host/port comes from `MB_SOCKET_REPL_PORT` in local mode, or from `REPL_HOST`/`REPL_PORT` in `.bot/pr-env.env` in PR-env mode (`repl.coredev.metabase.com:<PR_NUM>`).
3. **Error** if neither is available — STOP and tell the user.

You can force a specific backend with `--type nrepl` or `--type socket`, or override discovery with `--port` / `--host`.

Use the REPL for:
- Evaluating Clojure expressions against the running backend
- Requiring namespaces with `:reload` to pick up code changes
- Testing functions interactively
- Checking compilation

**Send one expression per eval call** in socket REPL mode — the socket REPL is stateless per-connection and returns output by reading until a short timeout. In nREPL mode multiple statements in a single call are fine, but for consistency and parallelizability, one form per call is still the best default. To evaluate multiple forms together, wrap them in `(do ...)`.

**Do not use `clj-nrepl-eval` directly.** It only speaks nREPL and will fail silently or hang in PR-env mode. Use `-bot-repl-eval` instead, and let it pick the backend.

If the wrapper itself reports "No REPL available", run `./bin/mage -bot-server-info` to see what discovery found, then decide whether to STOP or retry after waiting.



## Database Access

In **local-dev mode**, the app database connection URI is in `MB_DB_CONNECTION_URI` (from `-bot-server-info`). Always interact with the database through Clojure JDBC via the REPL — do NOT use `psql`, `mysql`, or other CLI database tools.

```bash
./bin/mage -bot-repl-eval '(do (require (quote [toucan2.core :as t2])) (t2/select :model/Card :id 1))'
```

```bash
./bin/mage -bot-repl-eval '(do (require (quote [toucan2.core :as t2])) (t2/query "SELECT id, name FROM report_card LIMIT 5"))'
```

In **PR-env mode** there is no direct database access — query data through API endpoints (`/api/dataset`, `/api/card/<id>/query`, `/api/user`, etc.) instead. The socket REPL can still run Clojure forms that hit the database, but you'll only have access to the running instance's connection, not a separate psql/mysql shell.

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

## Result File

Maintain a `result.md` file in your output directory (`{{OUTPUT_DIR}}/result.md`) that summarizes what you've done so far. This is what the user sees when they run `/autobot-result <branch> <bot>` — they check it instead of attaching to tmux to see how you're doing.

**Format:** exactly two paragraphs.
- **Paragraph 1 — What's done.** Concrete, past-tense summary of what you've completed so far: phases finished, files read, tests run, findings so far, decisions made. Be specific: "Analyzed the diff (3 backend files, 1 migration), built a truth table for the new auth gate, found 1 SEVERE regression." Not vague: "Reviewed the PR."
- **Paragraph 2 — What's next / current state.** What you're currently doing and what comes next, OR (if you're blocked or finished) a clear statement of that. If blocked, name what you need.

**After the two paragraphs, list every artifact you've produced so far as a bulleted list of absolute paths.** Include reports, screenshots, API responses, log captures, fix plans, prompt files — anything you've written to disk during this session. Paths must be absolute so the user can click or copy them directly. Add new items as you produce them; do NOT remove items from previous updates. Example format:

```markdown
## Artifacts

- `/Users/.../metabase-4__worktrees/<branch>/.bot/qabot/20260413-211500/diff-summary.md` — Phase 1 diff analysis
- `/Users/.../metabase-4__worktrees/<branch>/.bot/qabot/20260413-211500/initial-review.md` — Phase 2 static findings
- `/Users/.../metabase-4__worktrees/<branch>/.bot/qabot/20260413-211500/output/issue-01-before.png` — baseline screenshot
```

**When to update:** write `result.md` as soon as you start (even if the first version just says "Starting up, loading environment."), then overwrite it at every meaningful milestone — phase boundaries, finding a bug, finishing a major step, hitting a blocker. Don't wait for the end.

**Rules:**
- Overwrite the whole file each time — don't append
- Plain Markdown, no banners or boxes
- Never truncate to a placeholder like "TODO" — if you don't know what to say, write what you actually just did
- Keep the two-paragraph section tight; the artifact list can grow long
