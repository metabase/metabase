---
title: `mt/metric-value` hands any label map to iapetos, which keys series by the collector's declared labels: a lookup missing a declared label silently reads a fresh 0.0 child and an undeclared label is silently ignored, so adding a Prometheus label breaks tests far from the diff while the new label's own test passes against reverted code
slug: metric-value-label-mismatch-reads-zero
kind: test-harness
impact: introduced-bug
severity: medium
status: open # the affected tests were updated; the helper still checks nothing
area: `test/metabase/test/util.clj` `metric-value`, `src/metabase/analytics/prometheus.clj` (`qualified-vals`, `:metabase-metabot/llm-*` collectors), iapetos `set-labels`, `test/metabase/metabot/self_test.clj`, `test/metabase/metabot/api/document_test.clj`, `test/metabase/analytics/llm_token_usage_test.clj`
occurrences:
  - transcript: ~/.claude/projects/-Users-andrei-src-mb/7496be2b-9961-45b7-8797-6ed8b8fdfcc2/subagents/agent-ae3923bd48afbbf5d.jsonl
    lines: 184-360
    date: 2026-09-11
    jev: {any_papercut: 0.80, env_toolchain: 0.81, stale_state: 0.15, verify_mismatch: 0.50, misleading_code: 0.34, hidden_coupling: 0.63, stale_docs: 0.35, tool_footgun: 0.75, flaky: 0.28, agent_bug: 0.31, wasted_effort: 0.45, user_correction: 0.09}
---
## Summary
A metabase PR added `:provider` to the labels of five `llm-*` collectors. Ten assertions in two test namespaces the diff never touched still read the metrics with `{:model ... :source ...}` and got 0.0, so CI went red; the PR's own verification had run only the two namespaces it edited. The reverse also held: the PR's new 'labelled unknown' test passes against reverted code, because a label the collector does not declare is ignored on lookup. The reviewer subagent had to read iapetos source to explain both.

## Symptom
- L184-L188: the reviewer reads `iapetos/collector.clj` label handling to understand the lookups.
- L191-L193: greps other readers of the re-labelled metrics and finds `self_test.clj:1423-1531` and `document_test.clj:76,78`.
- L201-L256: `call-llm-prometheus-test`, `call-llm-structured-prometheus-test` and `generate-content-prometheus-test` fail with `actual: (not (== 100 0.0))` and `(not (== 20 0.0))`.
- L360: report: 'iapetos mints a separate zero-valued child for the missing label, so they read 0.0' and 'The Prometheus tests pass unchanged against reverted code (an undeclared label in a lookup map is silently ignored)'.

## Timeline
- Earlier session (not in this batch): the PR adds `:provider` to the collectors and verifies with the two namespaces it touches; CI goes red on the PR.
- L184-L188: reviewer reads iapetos to understand label matching.
- L191-L198: finds the untouched readers.
- L201-L256: reproduces 8 failures in self_test and 2 in document_test.
- L321-L360: report with a blocking finding (CI red) and a high one (the new test cannot fail).
- Cost: a red CI run, a reviewer detour into library source, and a test that pinned nothing.

## Root cause
iapetos builds the child series from the collector's declared label names, mapping each through the supplied map: a missing key becomes the empty string, a distinct child that starts at 0, and keys outside the declared list are never read. `mt/metric-value` calls `registry/get` with the caller's map (after `prometheus/qualified-vals`) and never compares its keys to the collector's `:labels`.

## Why agents fall for it
Nothing errors: a wrong label map returns a number. `(== 100 (mt/metric-value system metric labels))` looks precise, and the tests that break after a label change live in namespaces that never mention the changed file, so 'run the tests for the files I touched' misses them.

## Current state
Checked origin/master: `metric-value` in `test/metabase/test/util.clj` is still `(registry/get ... (#'prometheus/qualified-vals labels))` followed by `ops/read-value`, with no key check. The affected tests now pass `:provider` in their label maps, and all nine `llm-*` collectors declare `:provider`.

## Suggested fix
- Make `mt/metric-value` throw when the label keys differ from the collector's declared labels.
- Apply the same check in `prometheus/inc!`, `observe!` and `set!` in dev and test run modes.
- When a collector's `:labels` changes, grep test code for the metric keyword; a test that checks every literal label map passed to `metric-value` against the declared labels would make it mechanical.

## Detection signal
Prometheus test failures of the form `(not (== N 0.0))` after a diff that edits `:labels` in `prometheus.clj`; `metric-value` calls whose literal label map has a different key set than the collector.

## Raw excerpts
```
L184 [CALL] cd <scratchpad>/iapetos && cat iapetos/registry/collectors.clj; echo "=== collector.clj label fns ==="; /usr/bin/grep -n "label" iapetos/collector.clj | head -30
L188 [RESULT] (label-instance [this instance values] ... (defn- label-names [labels] (map metric/dasherize labels)) (defn- set-labels "Attach labels to the given `SimpleCollector` instance." ...
L193 [RESULT] test/metabase/metabot/api/document_test.clj:76:      (is (== 100 (mt/metric-value system :metabase-metabot/llm-input-tokens | test/metabase/metabot/api/document_test.clj:78: ... | test/metabase/metabot/self_test.clj:1423:            (is (== 100 (mt/metric-value system :metabase-metabot/llm-input-tokens labels)))
L201 [CALL] cd ~/src/mb/wt/<branch> && timeout 1500 clojure -X:dev:ee:ee-dev:drivers:drivers-dev:test :only '[metabase.metabot.self-test/call-llm-prometheus-test metabase.metabot.self-test/call-llm-structured-prometheus-test]' 2>&1 | tail -60
L228 [RESULT] FAIL in metabase.metabot.self-test/call-llm-prometheus-test (self_test.clj:1443) ... FAIL in metabase.metabot.self-test/call-llm-structured-prometheus-test (self_test.clj:1531)
L253 [RESULT] actual: (not (== 100 0.0)) | ... | FAIL in metabase.metabot.api.document-test/generate-content-prometheus-test (document_test.clj:78)
L256 [CALL] cd ~/src/mb/wt/<branch> && git grep -rn "llm-input-tokens\|llm-output-tokens\|llm-cache-creation-tokens\|llm-cache-read-tokens\|llm-tokens-per-call" -- . | ...
```
