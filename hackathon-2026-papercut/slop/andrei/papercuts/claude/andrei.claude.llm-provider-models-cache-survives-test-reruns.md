---
title: `metabase.llm.api.provider` keeps model listings in a private `defonce` 60-second TTL cache that no test fixture resets, so rerunning `provider-test` in a warm JVM within a minute fails five cache-keying tests whose stubs are never called.
slug: llm-provider-models-cache-survives-test-reruns
kind: test-harness
impact: wasted-time
severity: low
status: open
area: src/metabase/llm/api/provider.clj (models-cache, models-cache-key), test/metabase/llm/api/provider_test.clj, warm-REPL test runs
occurrences:
  - transcript: ~/.claude/projects/-Users-andrei-src-mb/c9770215-12da-4ae0-b3b7-9a6c0317621d/subagents/agent-a5a0bba6b0e78148e.jsonl
    lines: 566-585
    date: 2026-09-18
    jev: {any_papercut: 0.80, env_toolchain: 0.87, stale_state: 0.49, verify_mismatch: 0.38, misleading_code: 0.54, hidden_coupling: 0.55, stale_docs: 0.35, tool_footgun: 0.66, flaky: 0.58, agent_bug: 0.76, wasted_effort: 0.52, user_correction: 0.19}
---
## Summary
A review subagent mutation-testing an LLM adapter refactor ran twelve test namespaces several times in one warm REPL. The unmutated baseline came back red: seven failed assertions in five `metabase.llm.api.provider-test` tests about cache keying and refetching. The failures were stale entries in `models-cache` from the previous run; resetting the atom made the same run green.

## Symptom
- L571: `clojure.test/test-ns` over the set reported 35 failures, 7 in `metabase.llm.api.provider-test` and 28 in `metabase.metabot.self-test`, identical for base and mutant.
- L575: the hawk runner reported 7 failures, again identical for base and mutant, so the mutation check proved nothing.
- L581: the failing tests were `models-are-refetched-when-a-credential-changes-test`, `models-are-refetched-when-the-selected-model-changes-test`, `models-for-a-connection-that-names-its-own-model-test`, `models-for-a-connection-with-a-fixed-catalog-test`, `models-listing-prefers-the-selection-over-the-recorded-probe-test`.
- L584-585: after `(reset! @#'metabase.llm.api.provider/models-cache ...)` the run passed 2004/2004.

## Timeline
- L566-567 (11:11): `clojure.test/test-vars` wrapper reports 0 tests (agent's own mistake).
- L570-571: `test-ns` wrapper: 35 failures on the unmutated code.
- L574-575: hawk `find-and-run-tests-repl`: 7 failures on the unmutated code.
- L577-581: the agent pulls the failure names from the log.
- L584-585 (11:12): resets `models-cache` before each run; 0 failures, mutation still survives.
- Cost: 4 test runs and about a minute here; a less careful agent would report the baseline as broken. The 28 `self-test` failures under plain `clojure.test` (but not hawk) stayed unexplained.

## Root cause
On master `models-cache` is `(defonce ^:private models-cache (atom (cache/ttl-cache-factory {} :ttl models-cache-ttl-ms)))` with a 60 000 ms TTL, keyed on connection key, type, a hash of the config and the selected model. Tests such as `models-are-refetched-when-a-credential-changes-test` stub `metabot.self/list-models` and assert which keys it saw; within 60 s of an earlier run with the same fixture config, the cached entry answers and the stub is never called. The namespace only has `(use-fixtures :once (fixtures/initialize :db))`; nothing clears the cache. CI runs each test once per fresh JVM, so it never sees this.

## Why agents fall for it
The cache is private and `defonce`, so reloading the namespace does not clear it. The failures look like the refactor under review broke cache keying, which is exactly what the tests are about.

## Current state
Checked origin/master: `models-cache` is still a `defonce` TTL atom (provider.clj:211) and provider_test.clj has no fixture that resets it.

## Suggested fix
- Add an `:each` fixture (or a `with-empty-models-cache` helper) in provider_test.clj that resets `models-cache`.
- Or expose a `clear-models-cache!` and call it from the settings-change paths the tests exercise.

## Detection signal
Reruns of `metabase.llm.api.provider-test` in one JVM failing `models-are-refetched-*` or `models-for-a-connection-*` while a fresh `./bin/test-agent` run passes.

## Raw excerpts
```
L571 [RESULT] user=> UNMUTATED: {:total {:test 506, :pass 1969, :fail 35, :error 0}, :failing [[metabase.llm.api.provider-test {:test 80, :pass 282, :fail 7, :error 0}] [metabase.metabot.self-test {:test 82, :pass 709, :fail 28, :error 0}]]}
MUTANT (catalog request without :as :json): {:total {:test 506, :pass 1969, :fail 35, :error 0}, [...]}
L575 [RESULT] HAWK UNMUTATED: {:test 506, :pass 1997, :fail 7, :error 0}
HAWK MUTANT (GET requests without :as): {:test 506, :pass 1997, :fail 7, :error 0}
L581 [RESULT] [...] FAIL in metabase.llm.api.provider-test/models-for-a-connection-that-names-its-own-model-test (provider_test.clj:1314)
L584 [CALL] Bash: [...] (defn reset-models-cache! [] (reset! @#'metabase.llm.api.provider/models-cache (cache/ttl-cache-factory {} :ttl 60000)))
(defn hawk-run2 [] (reset-models-cache!) (select-keys (metabase.test-runner/find-and-run-tests-repl {:only nss}) [:test :pass :fail :error]))
L585 [RESULT] HAWK2 UNMUTATED: {:test 506, :pass 2004, :fail 0, :error 0}
HAWK2 MUTANT (GET requests without :as): {:test 506, :pass 2004, :fail 0, :error 0}
```
