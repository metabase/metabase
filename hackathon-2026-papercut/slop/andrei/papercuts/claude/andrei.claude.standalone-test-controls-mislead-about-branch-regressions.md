---
title: `llm-token-usage-test/track-snowplow!-premium-token-test` fails in every targeted local run, on the branch and on master, because the first read of `instance-creation` in a fresh app DB emits a `new_instance_created` event into the test's fake Snowplow collector
slug: standalone-test-controls-mislead-about-branch-regressions
kind: test-harness
impact: wasted-time
severity: low
status: open # first diagnosed in this session; test and lazy getter unchanged on master
area: test/metabase/analytics/llm_token_usage_test.clj (track-snowplow!-premium-token-test); src/metabase/analytics/settings.clj (-instance-creation); snowplow-test/with-fake-snowplow-collector
merged_from: snowplow-token-test-fails-in-fresh-app-db
occurrences:
  - transcript: ~/.claude/projects/-Users-andrei-src-mb/6bc1800e-c3b5-4388-9868-f321f7266cce.jsonl
    lines: 416-434
    date: 2026-09-14
    jev: {any_papercut: 0.79, env_toolchain: 0.25, stale_state: 0.40, verify_mismatch: 0.77, misleading_code: 0.17, hidden_coupling: 0.49, stale_docs: 0.23, tool_footgun: 0.77, flaky: 0.95, agent_bug: 0.26, wasted_effort: 0.32, user_correction: 0.08}
---
## Summary
After removing the usage-test pollution, one failure remained in the PR's namespaces: this Snowplow test. The agent ran the namespace alone on the branch and then in another worktree whose only difference from master is unrelated card code; it failed the same way in both, so it recorded it as a pre-existing local failure. The mechanism: the captured events start with `new_instance_created`, which the `instance-creation` setting's getter emits the first time it is read in a new app DB.

## Symptom
L417 and L424: `FAIL in metabase.analytics.llm-token-usage-test/track-snowplow!-premium-token-test (llm_token_usage_test.clj:37)`; L434: the same failure on a master-based worktree.

## Timeline
- L416-L417: the remaining failure after excluding usage-test.
- L423-L424: namespace alone on the branch fails.
- L428-L434: namespace alone in a worktree that differs from master only in unrelated card code fails the same way.
- Cost: about 3 minutes and two test runs; later sessions reused the finding.

## Root cause
`metabase.analytics.settings/-instance-creation` sets the setting and calls `track-event! :snowplow/account {:event :new_instance_created}` on first read; in a fresh test app DB that happens inside the test's fake collector.

## Why agents fall for it
It fails in the namespace the PR touches and in every targeted run, and passes in CI, so it looks like a local environment problem or a regression.

## Current state
Checked origin/master: the test and the lazy getter are unchanged.

## Suggested fix
- Read `instance-creation` before entering `with-fake-snowplow-collector` (or in a fixture), or filter popped events by schema.

## Detection signal
FAIL in `track-snowplow!-premium-token-test` with `new_instance_created` among the actual events.

## Raw excerpts
```
L416 [CALL] Bash: S=<scratchpad>; ./bin/test-agent :only '[metabase.analytics.llm-token-usage-test metabase.metabot.agent.core-test metabase.metabot.api.document-test metabase.metabot.example-question
L417 [RESULT] 1 855 assertions, 1 failure, 0 errors.
       1 FAIL in metabase.analytics.llm-token-usage-test/track-snowplow!-premium-token-test (llm_token_usage_test.clj:37)
       1 Ran 130 tests in 15.385 seconds
       1 Ran 30 tests in parallel, 100 single-threaded.
L428 [CALL] Bash: S=<scratchpad>; cd ~/src/mb/wt/<worktree> && git diff origin/master --stat | tail -1 && ./bin/test-agent :only '[metabase.analytics.llm-token-usage-test]' > $S/master-llm-usage-alone
L434 [RESULT] 2 files changed, 20 insertions(+), 13 deletions(-)
       1 22 assertions, 1 failure, 0 errors.
       1 FAIL in metabase.analytics.llm-token-usage-test/track-snowplow!-premium-token-test (llm_token_usage_test.clj:37)
       1 Ran 0 tests in parallel, 7 single-threaded.
       1 Ran 7 tests in 3.686 seconds
```

## Additional occurrence
- transcript: ~/.claude/projects/-Users-andrei-src-mb/fbd9d67a-1fb0-4afe-973d-ba7d8c5d19d1/subagents/agent-a6fd99bcc709d6e88.jsonl
  lines: 280-281
  date: 2026-09-17
  jev: {any_papercut: 0.86, env_toolchain: 0.58, stale_state: 0.31, verify_mismatch: 0.41, misleading_code: 0.41, hidden_coupling: 0.85, stale_docs: 0.32, tool_footgun: 0.80, flaky: 0.36, agent_bug: 0.94, wasted_effort: 0.74, user_correction: 0.11}

L281: `expected: [{:data {"hashed_metabase_license_token" #"[0-9a-f]{64}"}}]` / `actual: ({:data {"event" "new_instance_created"}, :user-id nil} {:data {... "model_id" "anthropic/claude-haiku-4-5" ...}})`, `864 assertions, 1 failure`.

- L280-L281: targeted run of five namespaces; the only failure is this test.
- L284: agent proceeds, relying on the PR body's note that it fails the same way on master.
- Cost: small here because it was already written down; the first encounter cost an investigation (session 6bc1800e L416-L434).

```
L280 [CALL] Bash: cd <scratchpad> && tail -30 tests1.log; /usr/bin/grep -n "FAIL\|ERROR in\|^Ran \|failures\|errors" tests1.log | head -40
L281 [RESULT] expected: [{:data {"hashed_metabase_license_token" #"[0-9a-f]{64}"}}]
      actual: ({:data {"event" "new_instance_created"}, :user-id nil}
               {:data {"cache_creation_tokens" nil, ... "model_id" "anthropic/claude-haiku-4-5", ...}, :user-id nil})
    1462:FAIL in metabase.analytics.llm-token-usage-test/track-snowplow!-premium-token-test (llm_token_usage_test.clj:37)
    1495:864 assertions, 1 failure, 0 errors.
```

## Additional occurrence
- transcript: ~/.claude/projects/-Users-andrei-src-mb/ac37fe71-7046-48c1-885f-5bf5d9754c26.jsonl
  lines: 1772-1881
  date: 2026-09-10
  jev: {any_papercut: 0.82, env_toolchain: 0.91, stale_state: 0.33, verify_mismatch: 0.46, misleading_code: 0.18, hidden_coupling: 0.30, stale_docs: 0.30, tool_footgun: 0.77, flaky: 0.42, agent_bug: 0.19, wasted_effort: 0.49, user_correction: 0.09}

- L1757: `expected: [{:data {"hashed_metabase_license_token" #"[0-9a-f]{64}"}}]` vs `actual: ({:data {"event" "new_instance_created"}, :user-id nil})`.
- L1781-L1787: the same namespace on a detached origin/master worktree: `FAIL in ...track-snowplow!-premium-token-test (llm_token_usage_test.clj:37)`.
- L1881: final report lists it as a pre-existing failure confirmed on master.

- L1772-L1777: after fixing the agent's own failures, one failure remains in the namespace.
- L1781-L1782: master worktree created and the namespace run there, tail only.
- L1786-L1787: ANSI-stripped rerun shows the same failure on master.
- L1881: reported as a pre-existing master failure.
- Cost: a worktree creation and two extra JVM test runs, plus a misleading "master is red" statement in the handoff.

```
L1757 [RESULT] expected: [1;31m[[0m ... "hashed_metabase_license_token" ... #"[0-9a-f]{64}" ... | actual: [1;31m([0m ... "event" ... "new_instance_created" ... :user-id nil ...
L1773 [RESULT] (deftest track-snowplow!-premium-token-test | (testing "premium token set → 64-char SHA-256 hex (no oss__ prefix)" | (mt/with-random-premium-token! [premium-token] | ... (snowplow-test/with-fake-snowplow-collector ...
L1781 [CALL] Bash: cd ~/src/mb/wt/<branch> && git worktree add -q --detach ~/src/mb/wt/verify-llm-usage-master origin/master && cd ~/src/mb/wt/verify-llm-usage-master && timeout 3000 clojure -X:dev:ee:ee-dev:drivers:drivers-dev:test :only '[metabase.analytics.llm-token-usage-test]' 2>&1 | tail -4
L1782 [RESULT] Ran 0 tests in parallel, 7 single-threaded. | Finding and running tests took 17.6 s. | Tests failed. | Running after-run hooks...
L1787 [RESULT] FAIL in metabase.analytics.llm-token-usage-test/track-snowplow!-premium-token-test (llm_token_usage_test.clj:37) | 22 assertions, 1 failure, 0 errors.
```
