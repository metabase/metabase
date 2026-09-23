---
title: CLAUDE.md says to run tests with ./bin/test-agent, but mage (babashka) tests aren't on its classpath; they need ./bin/mage -test [filter]
slug: test-agent-cannot-run-mage-tests
kind: doc-gap
impact: wasted-time
severity: low
status: open
area: CLAUDE.md "Running Backend Tests", bin/test-agent, bin/mage -test, mage/test/**
occurrences:
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-kondo-ratchets-merge-script/a0ba828b-731a-40b4-ac34-8be70d1da238.jsonl
    lines: 533-551
    date: 2026-08-31
    jev: {self_inflicted_bug: 0.89, tool_misuse: 0.96, misleading_signal: 0.51, user_correction: 0.79, codebase_trap: 0.69, flailing: 0.46, env_friction: 0.76}
---
## Summary
After editing `mage/test/mage/merge_kondo_ratchets_test.clj`, the agent followed CLAUDE.md and ran `./bin/test-agent :only '[mage.merge-kondo-ratchets-test]'`. It failed after JVM startup with a "Could not locate mage/merge_kondo_ratchets_test__init.class ... on classpath" stack trace. The agent then grepped bb.edn for a test task, found `-test {:doc "run all mage tests"`, and ran `./bin/mage -test`, which runs every mage test (95 tests) and doesn't print per-namespace results unless grepped. It had to grep for `Testing mage.merge-kondo-ratchets-test` to confirm its namespace ran at all.

## Symptom
```
L540 ... :cause "Could not locate ma…
     Could not locate mage/merge_kondo_ratchets_test__init.class, mage/merge_kondo_ratchets_test.clj or mage/merge_kondo_ratchets_test.cljc on classpath.
L543 grep -nE 'test' mage/bb.edn ... ; grep ... bb.edn
L544 636:  -test {:doc "run all mage tests"
L547 Ran 95 tests containing 764 assertions. 0 failures, 0 errors. All mage tests passed!
L551 Testing mage.merge-kondo-ratchets-test ...
```
In 7a939669 (module-resolver) the agent knew to use `./bin/mage -test modules`, so a filter argument exists in some form; the kondo-ratchets session didn't discover it.

## Root cause
Two test runners: JVM (`test-agent` / hawk) for src/test, babashka (`bin/mage -test`) for `mage/test`. CLAUDE.md documents only the first and says "do not fall back to `clj -X:dev:test`", which steers agents to test-agent for everything. Also (memory `reference_mage_test_ns_loading.md`) a mage test ns runs only if `mage.core-test` requires it, so a green `./bin/mage -test` does not prove a new namespace ran.

## Why agents fall for it
CLAUDE.md is explicit and emphatic about test-agent. mage tests are Clojure files under a `test/` directory, so nothing signals a different runner.

## Current state
Root CLAUDE.md "Running Backend Tests" has no mention of mage tests (`grep -n 'mage -test' CLAUDE.md` -> nothing). Memory `reference_mage_test_ns_loading.md` documents the loading rule but not the runner choice.

## Suggested fix
- Add to CLAUDE.md: "Tests under `mage/test` run with `./bin/mage -test [filter]` (babashka), not test-agent. A new mage test namespace must be required from `mage.core-test`."
- Or make `bin/test-agent :only '[mage.*]'` detect mage namespaces and delegate to `bin/mage -test`.

## Detection signal
- `bin/test-agent` invoked with a `mage.` namespace.
- Result containing `Could not locate mage/` ... `on classpath`.

## Additional occurrence
- transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-nested-modules-infrastructure-master/42c11300-351a-4e89-a17d-1aaa63c2bfde.jsonl
  lines: 1169-1208, 1434-1438
  date: 2026-08-30
  jev: {self_inflicted_bug: 0.92, tool_misuse: 0.97, misleading_signal: 0.49, user_correction: 0.24, codebase_trap: 0.83, flailing: 0.46, env_friction: 0.87}
- After `./bin/mage modules-validate` passed (19 tests, 8213 assertions), the agent tried `./bin/mage test` (L1172). That is not a task: it printed the task list and exited 0. It then found `./bin/mage -test` by grepping `.github/workflows/mage.yml` (L1178-1182), and that run showed a failure `modules_test.clj ... actual: (not (<= 46 44))` in `module-graph-may-not-become-more-connected`. The agent wrongly called it "red on master": its stash check (L1200-1205) only proved the failure pre-dated its edits on the `nested-modules-metrics` branch. So `modules-validate` (the JVM modules test) and `mage -test` (babashka tests) guard related module invariants with separate runners, and green on one says nothing about the other. Related: `driver-test-cap-counts-nested-modules`, which covers the same test and cap (now `max-allowed-count 47` at `mage/test/mage/modules_test.clj:315`).
