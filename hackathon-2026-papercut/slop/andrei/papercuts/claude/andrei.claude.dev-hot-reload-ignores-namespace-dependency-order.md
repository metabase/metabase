---
title: dev-ee's `--hot` reload re-requires git-dirty namespaces in no particular order, so adding a var in one file and using it in another made every request 500 ("No such var") on the shared server until both were reloaded by hand
slug: dev-hot-reload-ignores-namespace-dependency-order
kind: codebase-trap
impact: wasted-time
severity: medium
status: open
area: dev/src/dev/reload.clj (changed-namespaces, reload-namespaces!), `bun dev-ee --hot`, src/metabase/metabot/settings.clj, src/metabase/metabot/tools/search.clj
occurrences:
  - transcript: ~/.claude/projects/-Users-andrei-src-mb/7ee5589e-88e5-463a-a3d6-e429eb321d74/subagents/agent-a16477f6b264e54dd.jsonl
    lines: 87-92
    date: 2026-09-23
    jev: {any_papercut: 0.90, env_toolchain: 0.89, stale_state: 0.40, verify_mismatch: 0.24, misleading_code: 0.42, hidden_coupling: 0.67, stale_docs: 0.33, tool_footgun: 0.80, flaky: 0.56, agent_bug: 0.95, wasted_effort: 0.58, user_correction: 0.06}
---
## Summary
One subagent added a `metabot-demo-break-search` setting to metabot/settings.clj and read it from metabot/tools/search.clj, both uncommitted in the checkout the shared dev-ee runs from. The reloader required search.clj before settings.clj, failed with "No such var: metabot.settings/metabot-demo-break-search", and every request, including other agents' unrelated API calls, returned an HTML 500 "Syntax error compiling at (metabase/metabot/tools/search.clj:596:20)". The editing agent fixed it by reloading both namespaces over nREPL; another agent force-reloaded search.clj defensively before testing.

## Symptom
- Track subagent L87-L88: a dashboard setup probe fails with `SyntaxError: Failed to parse JSON` (the body was an HTML error page).
- Track L91-L92: `/api/database` returns 500 `Syntax error compiling at (metabase/metabot/tools/search.clj:596:20)`.
- Tool-signals subagent L208-L212: its own `PUT /api/setting/metabot-demo-break-search` gets the same 500; the dev server log shows `No such var: metabot.settings/metabot-demo-break-search` three times.
- Demo subagent L248: greps the log for "Syntax error|Reloading" and reloads search.clj over nREPL before chatting.

## Timeline
- Tool-signals L208 (14:23:00 UTC): 500 on its own endpoint; L211-L212 log shows three "No such var" failures; L215 reloads settings, snowplow, search, self.core and self over nREPL in dependency order, and L219-L220 the endpoint answers.
- Track L87-L92 (same minute): unrelated calls fail; the agent checks the dev server status (HTTP 500) and moves on to other work.
- Demo L248 (14:27): defensive manual reload of search.clj.
- Cost: about 6 tool calls across three agents and a burst of 500s on the shared server.

## Root cause
`dev.reload/changed-namespaces` takes .clj files from `git status --porcelain`, keeps loaded namespaces modified since their last reload, and `reload-namespaces!` calls `(require ns :reload)` in the resulting seq order with no dependency sort. A dependent reloaded before its dependency fails to compile; the failure is returned as `:failed` and the request that triggered the reload returns 500. Whether it would self-heal on a later request depends on further edits; here it failed at least three times in a row.

## Why agents fall for it
The 500 names a file whose code is correct; the fix (load the dependency first) is not obvious from the message; with several agents on one server, the agent that sees the 500 is not the one that made the edit.

## Current state
Checked origin/master: dev/src/dev/reload.clj still iterates `to-reload` without ordering it by namespace dependencies.

## Suggested fix
- Order `to-reload` topologically from the ns forms (clojure.tools.namespace's dependency tracker), or retry failed namespaces after the rest in the same pass.
- In dev, include the reload failure (`ns : No such var ...`) in the 500 body so the caller sees the real cause.

## Detection signal
Dev server log `Caused by: java.lang.RuntimeException: No such var:` next to `Syntax error compiling at` for a namespace with uncommitted edits; HTML 500 pages from localhost while two files are being edited.

## Raw excerpts
```
L87 [CALL] Bash: cat > $SCRATCH/probe.ts <<'EOF' | const h = { "x-api-key": process.env.MB_API_KEY!, "content-type": "application/json" }; ...
L88 [RESULT (ERROR)] Exit code 1 | SyntaxError: Failed to parse JSON | | Bun v1.3.14 (macOS arm64)
L91 [CALL] Bash: mise exec -- bun -e 'const r = await fetch(process.env.MB_URL + "/api/database", { headers: { "x-api-key": process.env.MB_API_KEY } }); console.log(process.env.MB_URL, r.status, (await r.text()).slice(0, 300))'; <dev server status check>
L92 [RESULT] http://localhost:3000 500 <html> | ... | <title>Error 500 Syntax error compiling at (metabase/metabot/tools/search.clj:596:20).</title> | ...
L208 [RESULT] (tool-signals subagent) <title>Error 500 Syntax error compiling at (metabase/metabot/tools/search.clj:596:20).</title> | ... <tr><th>URI:</th><td>/api/setting/metabot-demo-break-search</td></tr> ...
L212 [RESULT] (tool-signals subagent) 1047858:[backend] Caused by: java.lang.RuntimeException: No such var: metabot.settings/metabot-demo-break-search | 1047959:[backend] Caused by: java.lang.RuntimeException: No such var: metabot.settings/metabot-demo-break-search | 1048060:[backend] Caused by: ... No such var ...
L215 [CALL] (tool-signals subagent) Bash: <nrepl-eval> "(require 'metabase.metabot.settings :reload) (require 'metabase.analytics.snowplow :reload) (require 'metabase.metabot.tools.search :reload) (require 'metabase.metabot.self.core :reload) (require 'metabase.metabot.self :reload) ..."
L248 [CALL] (demo subagent) Bash: tail -300 <dev-ee log> | /usr/bin/grep -n "Syntax error\|Reloading\|reload\|ERROR" | tail -8 | cut -c1-220; date -u +%T; <nrepl-eval> '(do (require (quote metabase.metabot.tools.search) :reload) :ok)'
```
