---
title: `metabase-enterprise.metabot.usage-test` leaves a 'limit reached' result in the 10-second TTL memo of the usage-limit check, so Metabot namespaces run after it in the same JVM fail with `ai_usage_limit_reached` ('test limit reached')
slug: metabot-usage-limit-ttl-cache-leaks-across-tests
kind: test-harness
impact: wasted-time
severity: medium
status: open # usage_test clears the cache at the start of each test, never after
area: enterprise/backend/src/metabase_enterprise/metabot/usage.clj (check-instance-limit*, check-tenant-limit*, check-user-limit* via memoize/ttl; clear-limit-cache!); enterprise/backend/test/metabase_enterprise/metabot/usage_test.clj; test/metabase/metabot/self_test.clj, agent/core_test.clj
occurrences:
  - transcript: ~/.claude/projects/-Users-andrei-src-mb/6bc1800e-c3b5-4388-9868-f321f7266cce.jsonl
    lines: 351-422
    date: 2026-09-14
    jev: {any_papercut: 0.80, env_toolchain: 0.80, stale_state: 0.39, verify_mismatch: 0.73, misleading_code: 0.25, hidden_coupling: 0.62, stale_docs: 0.25, tool_footgun: 0.49, flaky: 0.80, agent_bug: 0.71, wasted_effort: 0.46, user_correction: 0.23}
---
## Summary
Running the changed test namespaces of a Metabot PR together produced 86 failures and 7 errors. The errors were `ExceptionInfo: test limit reached` (`:metabot/usage-limit-reached`) from `call-llm-structured-with-trace`, i.e. the quota message one of the usage-limit tests sets. `usage.clj` memoizes each limit check for 10 s with `clojure.core.memoize/ttl`, and the usage tests clear that memo at their start but not at their end, so the last 'exceeded' result keeps answering for up to 10 s, long enough to hit the next namespaces in the same JVM. Run without usage-test, the namespaces passed except one unrelated test.

## Symptom
L388: `959 assertions, 86 failures, 7 errors`, with ERRORs in `self-test` and `example-question-generator-test` at `self.clj:580`; L393: `clojure.lang.ExceptionInfo: test limit reached`, `error-code: "ai_usage_limit_reached"`.

## Timeline
- L351-L388: the changed namespaces of three branches run; one branch shows 93 failures.
- L392-L393: the errors all read 'test limit reached'.
- L401-L408: the string comes from usage_test.clj; usage.clj memoizes the checks.
- L416-L417: rerun without usage-test (1 unrelated failure) and usage-test alone (green).
- L422: agent concludes it is test pollution through the cached limit.
- Cost: about 4 minutes and two extra test runs.

## Root cause
`check-usage-limits!` goes through `memoize/ttl` wrappers with a 10 s threshold. Tests such as `instance-limit-exceeded-returns-message-test` call `clear-limit-cache!` first, then leave an 'exceeded' result cached when they finish; `with-temporary-setting-values` restores the message setting but not the memo.

## Why agents fall for it
The failures appear in namespaces the PR changed and look like a regression in LLM call handling; the cause is time-based (10 s), so it depends on test order and speed and disappears when a namespace runs alone.

## Current state
Checked origin/master: the TTL memoization and `clear-limit-cache!` are unchanged, and usage_test.clj still calls `clear-limit-cache!` only at the top of each test.

## Suggested fix
- Clear the limit cache in an `:each` fixture after the test as well as before (or wrap the tests in a macro that does both).
- Or bind the TTL to 0 in tests, or key the memo on something tests vary.

## Detection signal
Metabot test errors `test limit reached` / `ai_usage_limit_reached` outside usage_test, in a run that includes `metabase-enterprise.metabot.usage-test`.

## Raw excerpts
```
L388 [RESULT] ... === <branch>: metabase-enterprise.metabot.usage-test metabase.analytics.llm-token-usage-test metabase.metabot.agent.core-test metabase.metabot.api.document-test metabase.metabot.example-question-generator-test metabase.metabot.self-test
       1 959 assertions, 86 failures, 7 errors.
       1 ERROR in metabase.metabot.example-question-generator-test/call-llm-prometheus-test (self.clj:580)
       1 ERROR in metabase.metabot.self-test/call-llm-usage-log-test (self.clj:580)
       1 FAIL in metabase.metabot.agent.core-test/cumulative-usage-test (core_test.clj:752)
L393 [RESULT] 3051:ERROR in metabase.metabot.self-test/call-llm-usage-log-test (self.clj:580)
    3054-clojure.lang.ExceptionInfo: test limit reached
    3055-    error-code: "ai_usage_limit_reached"
    3056-       message: "test limit reached"
    3057-          type: :metabot/usage-limit-reached
L402 [RESULT] enterprise/backend/test/metabase_enterprise/metabot/usage_test.clj:256:    (mt/with-temporary-setting-values [metabot-quota-reached-message "test limit reached"]
    enterprise/backend/test/metabase_enterprise/metabot/usage_test.clj:263:                (is (= "test limit reached" (usage/check-usage-limits!))))
L408 [RESULT] src/metabase/metabot/usage.clj:26:   [:cache-creation-tokens {:optional true} [:maybe [:int {:min 0}]]]
    enterprise/backend/src/metabase_enterprise/metabot/usage.clj:4:   [clojure.core.memoize :as memoize]
L417 [RESULT] 1 855 assertions, 1 failure, 0 errors.
       1 FAIL in metabase.analytics.llm-token-usage-test/track-snowplow!-premium-token-test (llm_token_usage_test.clj:37)
       1 Ran 130 tests in 15.385 seconds
       1 Ran 30 tests in parallel, 100 single-threaded.
       1 124 assertions, 0 failures, 0 errors.
       1 Ran 1 tests in parallel, 27 single-threaded.
       1 Ran 28 tests in 6.780 seconds
```
