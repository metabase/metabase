---
title: `field-values-test/detached-fetch!-sweeps-stalled-fetches-test` raced on a `:future-ref` that was still nil (NPE in `future-cancelled?`), failing the H2 driver job on an unrelated PR
slug: field-values-detached-fetch-sweep-test-race
kind: test-harness
impact: wasted-time
severity: low
status: fixed # 615cfdb48bf "Fix race in detached-fetch!-sweeps-stalled-fetches-test" polls until the future-ref is set
area: test/metabase/warehouse_schema/models/field_values_test.clj; src/metabase/warehouse_schema/models/field_values.clj in-flight fetch registry
occurrences:
  - transcript: ~/.claude/projects/-Users-andrei-src-mb/c9e08d36-c34d-4cc5-8d80-81c8c80b1f99.jsonl
    lines: 1003-1048
    date: 2026-09-11
    jev: {any_papercut: 0.76, env_toolchain: 0.75, stale_state: 0.19, verify_mismatch: 0.81, misleading_code: 0.25, hidden_coupling: 0.62, stale_docs: 0.29, tool_footgun: 0.51, flaky: 0.93, agent_bug: 0.72, wasted_effort: 0.53, user_correction: 0.20}
---
## Summary
After the user said not to assume a flake, the agent pulled the H2 driver log: `ERROR in …field-values-test/detached-fetch!-sweeps-stalled-fetches-test` with `NullPointerException: Cannot invoke "java.util.concurrent.Future.isCancelled()" because "f" is null`. The test (from a recently merged change) grabs the registry entry once `started` fires, before the fetch's future has been stored. It took about six calls to prove unrelated, and a rerun cycle.

## Symptom
L1020: the ERROR line and the NPE; L1042: the agent identifies a race, `future-cancelled?` on a `:future-ref` that is still nil.

## Timeline
- L1003: H2 driver job red on a Slack-bot-only diff.
- L1014-L1020: log download, failing test and NPE located.
- L1025-L1042: reads the test and code, identifies the race.
- L1043-L1049: rerun blocked mid-run, watcher set.
- Fix merged upstream the same week (noted at chunk 3 L1630).
- Cost: about six calls plus a CI rerun.

## Root cause
The registry entry's `:future-ref` atom is filled after the future is submitted, and `started` can fire first; the test read it without waiting.

## Why agents fall for it
A red driver job on an unrelated PR demands proof it is unrelated, and concurrency failures give no pointer to the owning change.

## Current state
origin/master test lines 332-333: "submission, so `started` can fire before :future-ref is populated" followed by `(tu/poll-until 10000 @(:future-ref (get @registry ::stalled)))`.

## Suggested fix
- Done upstream (poll until the ref is set). General rule: tests over async registries wait on the state they read, not on a proxy signal.

## Detection signal
`Cannot invoke "java.util.concurrent.Future.isCancelled()" because "f" is null` in a test log.

## Raw excerpts
```
L1020 [RESULT] 1582 h2.log ⏎ === lines around the NPE (test name + stack) === ⏎ 617:…ERROR in metabase.warehouse-schema.models.field-values-test/detached-fetch!-sweeps-stalled-fetches-test (core.clj:7157) ⏎ 622:…java.lang.NullPointerException: Cannot invoke "java.util.concurrent.Future.isCancelled()" because "f" is null
```
