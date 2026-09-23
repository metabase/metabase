---
title: Capturing `ns/f` by value to "restore the real one" inside `with-dynamic-fn-redefs` captures the proxy once any earlier test patched the var, so the test passes alone and fails in its namespace
slug: dynamic-redefs-captured-var-value-is-proxy
kind: test-harness
impact: wasted-time
severity: low
status: documented-still-hit # dynamic_redefs.clj's runaway-recursion AssertionError and the original-fn docstring name the fix, but the error fired on the Slack handler's async path and never reached the test output
area: test/metabase/test/util/dynamic_redefs.clj (with-dynamic-fn-redefs, patch-vars!, original-fn); test/metabase/slackbot/streaming_test.clj
occurrences:
  - transcript: ~/.claude/projects/-Users-andrei-src-mb/68ee270d-d566-49b6-92ca-ded939295501/subagents/agent-a3a80b88fb4b1a068.jsonl
    lines: 187-233
    date: 2026-08-27
    jev: {any_papercut: 0.87, env_toolchain: 0.85, stale_state: 0.22, verify_mismatch: 0.32, misleading_code: 0.34, hidden_coupling: 0.85, stale_docs: 0.27, tool_footgun: 0.66, flaky: 0.51, agent_bug: 0.96, wasted_effort: 0.31, user_correction: 0.83}
---
## Summary
Two new Slackbot tests wanted the real `run-agent-loop` back after the shared Slack mocks stubbed it, so they did `(let [run-agent-loop agent/run-agent-loop] ... (mt/with-dynamic-fn-redefs [agent/run-agent-loop run-agent-loop ...]))`. `with-dynamic-fn-redefs` permanently replaces a var's root with a proxy the first time any test redefines it, so in a full namespace run the captured value was the proxy and the redef recursed into itself. Run alone the var was still unpatched and the tests passed. The proxy's fail-fast AssertionError fired inside the Slack handler's async path, so the only visible symptom was an empty Slack stream.

## Symptom
The namespace run (L211-L212) failed both throw-path tests with `(str/includes? "" "You do not have permission to use the AI assistant.")`: nothing reached Slack, and no error appeared in the test output. The single test passed in isolation (L215-L216).

## Timeline
- L187: tests written with `(let [run-agent-loop agent/run-agent-loop] ...)` then rebinding the var to that value.
- L211-L212: namespace run, two failures, empty Slack stream, no exception shown.
- L214-L216: reran one test alone, it passes.
- L218-L224: suspected redef pollution, read dynamic_redefs.clj, found `original-fn` in its docstring.
- L227-L233: switched to `(mt/original-fn #'agent/run-agent-loop)`, 26 tests green.
- Cost: about 4 minutes and 8 tool calls; cheap only because the agent guessed the redef machinery early.

## Root cause
`patch-vars!` rebinds the var root to a proxy the first time a var is redefined anywhere in the JVM and never restores it. After that, evaluating `agent/run-agent-loop` returns the proxy, and binding the proxy as its own local redefinition loops until the depth guard throws an AssertionError. The guard's message names the fix, but here it was thrown on the Slack handler's async executor and did not surface in the test report. Order dependence comes from whether an earlier test in the same JVM happened to patch the var.

## Why agents fall for it
`(let [f some-ns/f] ...)` is the standard Clojure idiom for keeping the original around, and it works in isolation, which is how agents usually check a new test. Nothing at the capture site says the var may already be a proxy; the docs live in the test util namespace the agent has no reason to open until it is already debugging.

## Current state
Checked origin/master: dynamic_redefs.clj still installs a permanent proxy; `original-fn` and the AssertionError message ("closing over the var resolves to the proxy, not the original") are there.

## Suggested fix
- Have `with-dynamic-fn-redefs` detect a binding whose value is the var's own proxy and substitute `::original` (or throw at bind time with the original-fn hint), instead of failing at call depth 128.
- Add a kondo hook flagging `(let [x ns/f] ... (with-dynamic-fn-redefs [ns/f x ...]))`.
- Mention `mt/original-fn` in the `with-dynamic-fn-redefs` docstring, where agents look first.

## Detection signal
A test that passes alone and fails in its namespace, with `with-dynamic-fn-redefs` binding a var to a value captured from the same var; "runaway recursion through proxy" in logs; transcript phrases like "passes in isolation" plus "dynamic-redef".

## Raw excerpts
```
L187 [CALL] Edit .../test/metabase/slackbot/streaming_test.clj: ... (deftest slackbot-dm-posts-permission-copy-when-metabot-access-denied-test (testing "the 403 the agent loop's access check throws reaches the DM as access copy" (let [run-agent-loop agent/run-agent-loop] ... (mt/with-dynamic-fn-redefs [agent/run-agent-loop run-agent-loop ...
L211 [CALL] Bash: cd ~/src/mb/wt/<branch> && ./bin/test-agent :only '[metabase.slackbot.streaming-test]' 2>&1 | tail -30
L212 [RESULT] actual: (not | (str/includes? | "" | "You do not have permission to use the AI assistant.")) | | FAIL in metabase.slackbot.streaming-test/slackbot-channel-posts-permission-copy-when-metabot-access-denied-test (streaming_test.clj:408) ... 96 assertions, 2 failures, 0 errors.
L216 [RESULT] ... 3 assertions, 0 failures, 0 errors.
L228 [CALL] Edit .../streaming_test.clj: old='... (let [run-agent-loop agent/run-ag[...]' new='... (let [run-agent-loop (mt/original-fn #'agent/run-agent-loop)]'
L233 [RESULT] Ran 26 tests in 9.854 seconds | 96 assertions, 0 failures, 0 errors.
```
