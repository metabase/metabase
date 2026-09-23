---
title: `field-values-test/get-or-create-full-field-values!-outlives-canceled-caller-test` polls up to 10 s for FieldValues saved by a background fetch and ran out of time on the H2 (OSS) driver job of an unrelated PR
slug: field-values-canceled-caller-test-timing-flake
kind: test-harness
impact: wasted-time
severity: low
status: open # test unchanged on master
area: test/metabase/warehouse_schema/models/field_values_test.clj (get-or-create-full-field-values!-outlives-canceled-caller-test); metabase.test.util/poll-until
occurrences:
  - transcript: ~/.claude/projects/-Users-andrei-src-mb/6bc1800e-c3b5-4388-9868-f321f7266cce.jsonl
    lines: 583-606
    date: 2026-09-14
    jev: {any_papercut: 0.79, env_toolchain: 0.25, stale_state: 0.40, verify_mismatch: 0.77, misleading_code: 0.17, hidden_coupling: 0.49, stale_docs: 0.23, tool_footgun: 0.77, flaky: 0.95, agent_bug: 0.26, wasted_effort: 0.32, user_correction: 0.08}
---
## Summary
The only red job on a card-cascade PR was 'driver-tests / H2 (OSS)', with one ERROR in this test at `util.clj:1783` (the `poll-until` timeout). The test cancels the caller's future and waits up to 10 s for the fetched values to be saved in the background. The agent judged it a timing flake and set up a rerun after the run finished.

## Symptom
L599 and L606: `ERROR in metabase.warehouse-schema.models.field-values-test/get-or-create-full-field-values!-outlives-canceled-caller-test (util.clj:1783)` 'FieldValues fetched on behalf of a canceled request still get saved to the app DB'.

## Timeline
- L583-L585: checks show one failing driver job.
- L598-L606: log pulled; failure is the `poll-until` timeout; test history read.
- L619-L632: rerun refused until the run finished; background rerun set up.
- Cost: about 5 minutes of triage plus a CI rerun.

## Root cause
Not established. The assertion depends on a background fetch finishing within 10 s after the caller's future is cancelled, which is sensitive to runner load.

## Why agents fall for it
It is an ERROR (not a FAIL) from a test-utility frame, which hides that it is a timeout.

## Current state
Checked origin/master: the test still asserts via `(tu/poll-until 10000 ...)` after `future-cancel`.

## Suggested fix
- Wait on a promise delivered when the background save completes instead of polling with a fixed deadline, or raise the deadline for CI.

## Detection signal
ERROR in `get-or-create-full-field-values!-outlives-canceled-caller-test` at `util.clj` (poll-until).

## Raw excerpts
```
L599 [RESULT] 1730908 <scratchpad>/82378-h2-oss.log
       1 2026-09-14T19:04:45.0674169Z [ci-conductor] 🔴 VERDICT: FAIL – 1 of 1 failure(s) are NOT quarantined.
       1 2026-09-14T19:04:44.8444424Z [ci-conductor]   failure: metabase.warehouse-schema.models.fiel [...534 chars...] .3022987Z Ran 1514 tests in parallel, 1735 single-threaded.
       1 2026-09-14T19:04:27.2952759Z 13292 assertions, 0 failures, 1 error.
L606 [RESULT] 2026-09-14T19:03:53.2064556Z ERROR in metabase.warehouse-schema.models.field-values-test/get-or-create-full-field-values!-outlives-canceled-caller-test (util.clj:1783)
    2026-09-14T19:03:53.2066787Z FieldValues fetched on behalf of a canceled request still get saved to the app DB (<ticket>) 
    2026-09-14T19:03:53.2067932Z using test-data dataset
```
