---
title: Running backend tests with `clojure -M:dev:ee:ee-dev -e "(clojure.test/run-tests ...)"` instead of `./bin/test-agent` leaves the JVM alive after the tests finish and uses the checkout's dev-mode H2 file, so each call burns the whole Bash timeout, trailing cleanup such as `git stash pop` never runs, and leftover JVMs make later runs fail with `Unable to connect to Metabase h2 DB`.
slug: adhoc-clojure-e-test-runs-never-exit
kind: test-harness
impact: wasted-time
severity: high
status: documented-still-hit # a local note covered it
area: clojure -M:dev -e test runs, deps.edn :dev vs :test aliases, bin/test-agent, H2 app DB file, Bash tool timeout
occurrences:
  - transcript: ~/.claude/projects/-Users-andrei-src-mb/b9969651-5371-431a-b6c4-6d9916153234.jsonl
    lines: 352-2690
    date: 2026-08-24
    jev: {any_papercut: 0.79, env_toolchain: 0.90, stale_state: 0.37, verify_mismatch: 0.44, misleading_code: 0.31, hidden_coupling: 0.70, stale_docs: 0.38, tool_footgun: 0.69, flaky: 0.84, agent_bug: 0.86, wasted_effort: 0.62, user_correction: 0.06}
---
## Summary
Addressing review findings on two PRs, the agent ran tests through ad hoc `clojure -M:dev:ee:ee-dev -e` scripts. The two scripts that ended in `(System/exit ...)` returned in about 35 s; later scripts without it that got as far as running tests printed their results and then hung until the Bash timeout (8 to 10 minutes) or were moved to the background and never produced output. Over two days this happened at least eight times: the agent stashed its fixes and left them stashed twice, blamed the hang on JVM startup, stopped the user's dev server, and was interrupted by the user after 55 and 25 minutes. Because the `:dev` alias runs in dev mode on the checkout's H2 file, runs in the main checkout also failed to connect while the dev server or a hung JVM held the file.

## Symptom
- L378 and L402: `Exit code 143 Command timed out after 10m 0s` and `9m 0s`; the `; git stash pop` at the end never ran (L381-382 shows the stash still there).
- L407: the agent blames the hang on JVM startup and drops its pre-fix check that the new test fails.
- L527, L1408, L1766: `Command did not complete within its 600s timeout and was moved to the background`; the output file stayed empty (L560-733) until `pkill` at L745.
- L783 and L1280: the user interrupts after 55 minutes of running, and again after 25 minutes.
- L1205: 11 errors `FATAL test.initialize :: Error initializing :db [...] Unable to connect to Metabase h2 DB` in the main checkout.
- L2669: `A client timed out while waiting to acquire a resource from com.mchange.v2.resourcepool.BasicResourcePool [...] awaitAvailable()`; at L2676 the agent attributes it to two test JVMs colliding on the H2 pool.

## Timeline
- L352-359 (19:51-19:52): two runs ending in `(System/exit ...)` finish in 35 s each.
- L370-371: a run without System/exit returns in 29 s with empty filtered output, apparently dying before any test ran.
- L377-378 (19:53-20:03): run without System/exit, then `; git stash pop`; timed out, fix left stashed; popped at L387.
- L393-402 (20:03-20:12): same again; L407 blames JVM startup and drops the check.
- L414-415 (20:13-20:21): wrapped in `timeout 480`; results print, the call still takes 8 minutes.
- L526-527 (20:23-20:33): moved to background; empty output file through L733; `pkill` at L745.
- L762-783: another run; the user interrupts after 55 minutes of total running.
- L1196-1205 (21:04-21:14): main checkout; 11 H2 connection errors, results only after the timeout.
- L1275-1280: the agent stops the dev server to free the H2 lock and starts another run; user interrupts at 25 minutes.
- L1406-1408 and L1766: two more runs exceed the 600 s tool timeout.
- L2633-2690 (2026-08-25): a run collides with a leftover JVM on the H2 pool; `pkill` and rerun.
- Cost: roughly 1.5 hours of tool time, two user interrupts, the dev server stopped, and two stashes of unpushed fixes left behind.

## Root cause
- `clojure.main` returns from the `-e` forms but the JVM exits only when no non-daemon threads remain; something started while loading or initializing the Metabase test namespaces keeps it alive (which thread was not identified). The runs that ended with `(System/exit ...)` exited normally.
- On master the `:dev` alias sets `-Dmb.run.mode=dev` with no in-memory app DB, while `:test` sets `-Dmb.run.mode=test` and `-Dmb.db.in.memory=true`. Test fixtures in a dev-mode JVM initialize the checkout's H2 file, which a running dev server or an earlier hung JVM holds; the "dev server holds the H2 lock" diagnosis is the agent's and was not independently confirmed.
- `./bin/test-agent` runs hawk's CLI entry point with the `:test` alias and exits.

## Why agents fall for it
`clojure -e` looks like a quick one-shot and works for pure namespaces. Output piped through grep shows nothing until the process exits, the Bash tool silently moves long calls to the background, and nothing warns that the JVM is idle rather than busy.

## Current state
Checked origin/master: deps.edn `:dev` jvm-opts use `-Dmb.run.mode=dev`; `:test` uses `mb.run.mode=test` and `mb.db.in.memory=true`; the repo's CLAUDE.md (lines 42-47) says not to fall back to raw `clj -X:dev:test` and to use `./bin/test-agent`. This session ran from a directory above the checkout, so whether that file was ever loaded is unknown.

## Suggested fix
- Mark the threads Metabase starts on namespace load or test init as daemon, or have the test fixtures shut them down, so `clojure -e` exits.
- Refuse or warn loudly when `metabase.test` initializes an app DB in `mb.run.mode=dev`.
- A PreToolUse hook that redirects `clojure -M:dev ... -e ...run-tests` to `./bin/test-agent :only '[...]'`.

## Detection signal
Bash commands matching `clojure -M:dev[^ ]* -e .*run-tests` without `System/exit`, followed by `Command timed out after` or `did not complete within its 600s timeout`; `Unable to connect to Metabase h2 DB`; `pkill -f "clojure -M:dev`.

## Raw excerpts
```
L352 [CALL] Bash: mise exec -- clojure -M:dev:ee:ee-dev -e " (require '[clojure.test :as t]) [...] (let [r (t/run-tests 'metabase.llm.provider-test 'metabase.metabot.self.bedrock-test)] (println r) (System/exit (if (or (pos? (:fail r)) (pos? (:error r))) 1 0)))" 2>&1 | tail -40
L353 [RESULT] [...] Ran 55 tests containing 238 assertions. 0 failures, 0 errors.
L377 [CALL] Bash: git stash push -- src/metabase/llm/provider.clj src/metabase/metabot/self/bedrock.clj >/dev/null && mise exec -- clojure -M:dev:ee:ee-dev -e " [...] (println :BEDROCK (t/run-test-var #'[...]))" 2>&1 | grep -vE "INFO|DEBUG|WARN" | tail -30; git stash pop >/dev/null
L378 [RESULT (ERROR)] Exit code 143 Command timed out after 10m 0s
L382 [RESULT] stash@{0}: WIP on <branch>: [...]
L402 [RESULT (ERROR)] Exit code 143 Command timed out after 9m 0s
L527 [RESULT] Command did not complete within its 600s timeout and was moved to the background (ID: bzatarfbn). [...]
L745 [CALL] Bash: pkill -f "clojure -M:dev:ee" ; sleep 2; ps aux | grep -c "[c]lojure -M:dev:ee"
L1205 [RESULT] [...] FATAL test.initialize :: Error initializing :db {mb-test=metabase.metabot.self.claude-test/claude-system-cache-breakpoint-test} clojure.lang.ExceptionInfo: Unable to connect to Metabase h2 DB. {}
L1275 [CALL] Bash: <stop the dev server> && timeout 600 mise exec -- clojure -M:dev:ee:ee-dev -e " [...]" [...]
L2669 [RESULT] Execution error (TimeoutException) at com.mchange.v2.resourcepool.BasicResourcePool/awaitAvailable (BasicResourcePool.java:1658). A client timed out while waiting to acquire a resource from com.mchange.v2.resourcepool.BasicResourcePool@4994375f -- timeout at awaitAvailable()
```
