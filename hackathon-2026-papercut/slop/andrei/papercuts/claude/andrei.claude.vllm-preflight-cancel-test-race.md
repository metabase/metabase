---
title: `vllm-test/preflight-cancels-the-sibling-probe-on-failure-test` fails under CI load when the sibling probe's future is cancelled before it starts, so its `interrupted` promise is never delivered
slug: vllm-preflight-cancel-test-race
kind: test-harness
impact: wasted-time
severity: medium
status: open # test body unchanged on master
area: test/metabase/metabot/self/vllm_test.clj (preflight-cancels-the-sibling-probe-on-failure-test); src/metabase/metabot/self/vllm.clj preflight probes
occurrences:
  - transcript: ~/.claude/projects/-Users-andrei-src-mb/fbd9d67a-1fb0-4afe-973d-ba7d8c5d19d1/subagents/agent-a342a3a46659ac024.jsonl
    lines: 1176-1243
    date: 2026-09-17
    jev: {any_papercut: 0.79, env_toolchain: 0.74, stale_state: 0.20, verify_mismatch: 0.92, misleading_code: 0.23, hidden_coupling: 0.38, stale_docs: 0.18, tool_footgun: 0.53, flaky: 0.95, agent_bug: 0.34, wasted_effort: 0.43, user_correction: 0.08}
---
## Summary
The test stubs the `required` probe to block on a latch and deliver `interrupted` true from its InterruptedException handler, then asserts `(true? (deref interrupted 10000 :never-cancelled))` after the `auto` probe fails. If the sibling future is cancelled before its body starts, no InterruptedException is thrown, the promise stays empty and the assertion fails. It failed once in 'Java 25 EE App DB Tests (Part 2)' on a PR that did not touch vLLM, passed locally in 0.03 s and on the rerun.

## Symptom
L1183-L1186: `FAIL in metabase.metabot.self.vllm-test/preflight-cancels-the-sibling-probe-on-failure-test (vllm_test.clj:1080)` and ci-conductor 'VERDICT: FAIL, 1 of 1 failure(s) are NOT quarantined'.

## Timeline
- L1176: one backend job red.
- L1182-L1189: job log downloaded, failure located.
- L1192-L1204: no issue on file; master's same job recently green.
- L1214-L1215: passes locally.
- L1207-L1243: rerun refused until the run finished, then attempt 2 green.
- Cost: about 21 minutes of investigation and CI waiting (13:20 to 13:41).

## Root cause
A race between `future-cancel` and future start: cancelling a future that has not started prevents its body from running, so the test's only signal (the catch block) never fires. The agent's diagnosis at L1217 matches: under load the cancelled probe never starts, so its promise is never delivered.

## Why agents fall for it
It sits in the same provider namespace family as the PR, so it looks related, and it passes every local run.

## Current state
Checked origin/master: the test is unchanged and still asserts `(true? (deref interrupted 10000 :never-cancelled))`.

## Suggested fix
- Deliver a `started` promise at the top of the stub and only require interruption when the probe started; otherwise assert the future is cancelled.
- Or expose the sibling future so the test checks `future-cancelled?` directly.

## Detection signal
FAIL in `preflight-cancels-the-sibling-probe-on-failure-test`, typically with `:never-cancelled`.

## Raw excerpts
```
L1176 [RESULT] {"pass":46,"pending":40,"skipping":50}
    [exited with code 0]
    {"fail":1,"pass":79,"pending":59,"skipping":50}
    fail backend-tests / Java 25 EE App DB Tests (Part 2)
L1186 [RESULT] 1182:2026-09-17T13:08:26.3557004Z FAIL in metabase.metabot.self.vllm-test/preflight-cancels-the-sibling-probe-on-failure-test (vllm_test.clj:1080)
    1416:2026-09-17T13:19:52.6192713Z [ci-conductor]   failure: metabase.metabot.self.vllm-test / preflight-cancels-the-sibling-probe-on-failure-test
L1215 [RESULT] Ran 1 tests in 0.031 seconds
    2 assertions, 0 failures, 0 errors.
L1243 [RESULT] success attempt 2
```
