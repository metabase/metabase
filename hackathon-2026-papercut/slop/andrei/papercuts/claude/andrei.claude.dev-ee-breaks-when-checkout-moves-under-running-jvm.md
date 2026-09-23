---
title: Switching the metabase checkout under a running `bun dev-ee --hot` leaves localhost failing on namespaces the old JVM half-loads (here an invalid-schema macroexpansion in comments/api.clj) until someone restarts it
slug: dev-ee-breaks-when-checkout-moves-under-running-jvm
kind: env-friction
impact: wasted-time
severity: low
status: documented-still-hit # a local note covered it
area: `bun dev-ee` (`clojure -M:run:ee:dev:dev-start --hot`), dev/src/dev/reload.clj, src/metabase/comments/api.clj
merged_from: dev-ee-hot-reload-500-after-checkout-moves
occurrences:
  - transcript: ~/.claude/projects/-Users-andrei-src-mb/7ee5589e-88e5-463a-a3d6-e429eb321d74.jsonl
    lines: 2177-2233
    date: 2026-09-23
    jev: {any_papercut: 0.86, env_toolchain: 0.95, stale_state: 0.50, verify_mismatch: 0.14, misleading_code: 0.34, hidden_coupling: 0.63, stale_docs: 0.27, tool_footgun: 0.85, flaky: 0.62, agent_bug: 0.86, wasted_effort: 0.63, user_correction: 0.22}
---
## Summary
The checkout had been moved to a branch three weeks ahead of the running server's code (a fast-forward pull plus a branch switch 27 minutes earlier). A status check showed HTTP 000, and the dev server log showed `Invalid body schema: :malli.core/invalid-schema [:map {:closed true} [:emoji :metabase.comments.schema/reaction-emoji]]` while macroexpanding comments/api.clj, a namespace unrelated to any work in progress. The agent recognised the pattern, diffed deps between the two commits, reinstalled and restarted.

## Symptom
- L2198: `session: running` / `app on :3000 -> HTTP 000`.
- L2204: log tail ends in `Syntax error macroexpanding at (metabase/comments/api.clj:280:1)` caused by an invalid schema reference.
- L2215: reflog shows `checkout: moving from master to <branch> 27 minutes ago`.

## Timeline
- L2197-L2198: status check finds the server not answering.
- L2203-L2204: log shows the comments/api.clj macroexpansion error.
- L2214-L2220: reflog and a diff of package.json, bun.lock and deps.edn between the two commits.
- L2225-L2233: stop, `bun install --frozen-lockfile`, start.
- Cost: 5 tool calls plus a restart of about 1.5 minutes; the shared dev server had possibly been failing since the checkout 27 minutes earlier.

## Root cause
The long-running JVM loads namespaces lazily and hot-reloads git-dirty ones on requests; after a checkout, code it loads for the first time references vars, schemas or deps the old process never loaded. Which code path loaded comments/api.clj here is unknown.

## Why agents fall for it
The error names a file nobody touched; the dev server process is still up and its status check still says it is running; the checkout may have been done by the user or another agent.

## Current state
Checked origin/master dev/src/dev/reload.clj: reloads are driven by `git status --porcelain`; nothing records the HEAD at boot or warns after a branch switch.

## Suggested fix
- Record HEAD at dev-server boot; have the `--hot` reload path (and any status check) report "checkout moved since boot, restart" instead of serving errors.
- A post-checkout or post-merge git hook that restarts dev-ee when the dev checkout moves.

## Detection signal
Localhost 500/000 shortly after `git checkout`, `git pull` or `git rebase` in the dev checkout; "Syntax error (compiling|macroexpanding) at (metabase/...)" naming files outside the current diff.

## Raw excerpts
```
L2197 [CALL] Bash: cd metabase && git fetch -q origin <branch> 2>&1 | tail -2; ... echo "== status"; <dev server status check>; ...
L2198 [RESULT] ... == status | session: running | app on :3000 -> HTTP 000 | ...
L2203 [CALL] Bash: tail -c 3000 <dev-ee log> | tail -25; ...
L2204 [RESULT] ... [backend] Caused by: clojure.lang.ExceptionInfo: Invalid body schema: :malli.core/invalid-schema | [backend] [:map {:closed true} [:emoji :metabase.comments.schema/reaction-emoji]] | ... | [backend] 2026-09-23 14:06:54,244 ERROR server.instance :: Unexpected exception in endpoint: Syntax error macroexpanding at (metabase/comments/api.clj:280:1).
L2215 [RESULT] d994a365f72 HEAD@{0} checkout: moving from master to <branch> 27 minutes ago | d994a365f72 HEAD@{1} pull: Fast-forward 27 minutes ago | ...
L2220 [RESULT] bun.lock | 260 +++---- | deps.edn | 34 +++-- | package.json | 62 +++--- | 3 files changed, 176 insertions(+), 180 deletions(-)
L2226 [CALL] Bash: <stop dev server>; cd metabase && mise exec -- bun install --frozen-lockfile 2>&1 | tail -3 && <start dev server>
```

## Additional occurrence
- transcript: ~/.claude/projects/-Users-andrei-src-mb/ea892f4f-4e3c-479f-b370-880a3afe35e8/subagents/agent-ab0bb55b4762360c4.jsonl
  lines: 82-103
  date: 2026-09-03
  jev: {any_papercut: 0.77, env_toolchain: 0.82, stale_state: 0.24, verify_mismatch: 0.17, misleading_code: 0.14, hidden_coupling: 0.24, stale_docs: 0.55, tool_footgun: 0.56, flaky: 0.27, agent_bug: 0.11, wasted_effort: 0.56, user_correction: 0.06}

ab0b L86: `session: running ⏎ app on :3000 -> HTTP 500`; L99: `ERROR server.instance :: Unexpected exception in endpoint: Syntax error compiling at (metabase/comments/api.clj:160:35).`; a058 L82: the agent skips live verification because the dev server is down.

- Subagent a058 L76-L82: HTTP 500, live verification dropped from the review.
- ab0b L82-L99: HTTP 500 and the compile error in an unrelated namespace.
- ab0b L103: does not restart it.
- Cost: two reviews without live verification; the server stayed broken until later restarts.

```
L86 [RESULT] dev checkout: master @ 39ad1d51675 2026-09-01 Keep ratchets off release branches (#81033) ⏎ behind origin/master by: 77 commits ⏎ --- status: ⏎ session: running ⏎ app on :3000 -> HTTP 500
L99 [RESULT] [backend] 	at org.eclipse.jetty.server.Server.handle(Server.java:197) ⏎ … metabase/comments/api.clj:160:35). ⏎ [backend] 2026-09-03 08:18:57,281 ERROR server.instance :: Unexpected exception in endpoint: Syntax error compiling at (metabase/comments/api.clj:160:35).
```
