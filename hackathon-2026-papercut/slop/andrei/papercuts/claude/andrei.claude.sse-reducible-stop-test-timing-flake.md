---
title: `metabase.metabot.self-test/sse-reducible-stops-response-test` asserts the server wrote fewer than 10 of 30 events within a fixed 30 ms sleep, which fails on a loaded CI runner
slug: sse-reducible-stop-test-timing-flake
kind: test-harness
impact: wasted-time
severity: low
status: open # test unchanged on master
area: test/metabase/metabot/self_test.clj (sse-reducible-stops-response-test); metabase.metabot.self.core/sse-reducible
occurrences:
  - transcript: ~/.claude/projects/-Users-andrei-src-mb/fbd9d67a-1fb0-4afe-973d-ba7d8c5d19d1/subagents/agent-a632b29c43867bb36.jsonl
    lines: 384-469
    date: 2026-09-17
    jev: {any_papercut: 0.76, env_toolchain: 0.36, stale_state: 0.33, verify_mismatch: 0.89, misleading_code: 0.27, hidden_coupling: 0.68, stale_docs: 0.27, tool_footgun: 0.64, flaky: 0.94, agent_bug: 0.48, wasted_effort: 0.51, user_correction: 0.54}
---
## Summary
The test streams 30 SSE events from a Jetty handler every 10 ms, reduces two, sleeps 30 ms, then asserts `(> @cnt 20)`. On a MariaDB app-DB job the counter had dropped to 15 (`actual: (not (> 15 20))`), so it failed on a PR that did not touch streaming. It passed locally and on the granular rerun.

## Symptom
L387-L391: `FAIL in metabase.metabot.self-test/sse-reducible-stops-response-test (self_test.clj:408)` 'SHOULD have stopped writing when reduction terminated early', `expected: (> (clojure.core/deref cnt) 20)`, `actual: (not (> 15 20))`.

## Timeline
- L380-L385: one failing app-DB job; log downloaded.
- L387-L395: failure and test source read.
- L398-L399: passes locally.
- L402-L411: other app-DB jobs green; job rerun refused while the run was in progress.
- L414-L469: waits for the run, reruns; the granular rerun passes.
- Cost: about 22 minutes (09:46 to 10:08) of investigation and CI waiting.

## Root cause
Wall-clock timing: how many 10 ms writes land before the client closes the connection and the 30 ms sleep ends depends on runner load.

## Why agents fall for it
It is in the Metabot namespace the PR touches, so the first assumption is a regression.

## Current state
Checked origin/master: unchanged (30 events, 10 ms writes, `(Thread/sleep 30)`, `(> @cnt 20)`).

## Suggested fix
- Assert that the writer saw the connection close (a promise delivered in the handler's catch) instead of counting writes after a sleep.
- Or relax the check to 'stopped before writing all 30'.

## Detection signal
FAIL in `sse-reducible-stops-response-test` with `(not (> N 20))`.

## Raw excerpts
```
L387 [CALL] Bash: SP=<scratchpad> && /usr/bin/grep -an "sse-reducible-stops-response-test" $SP/mariadb-p2.log | head -5; N=$(/usr/bin/grep -an "FAIL in metabase
L391 [RESULT] FAIL in metabase.metabot.self-test/sse-reducible-stops-response-test (self_test.clj:408)
    SHOULD have stopped writing when reduction terminated early
    expected: (> (clojure.core/deref cnt) 20)
      actual: (not (> 15 20))
L399 [RESULT] Ran 1 tests in 7.568 seconds
    2 assertions, 0 failures, 0 errors.
L411 [RESULT] {"message":"The workflow run containing this job is already running","documentation_url":"https://docs.github.com/rest/actions/workflow-runs#re-ru
L469 [RESULT] Granular rerun of previously-failed tests: [metabase.metabot.self-test/sse-reducible-stops-response-test]
    Ran 1 tests in 8.418 seconds
    2 assertions, 0 failures, 0 errors.
```
