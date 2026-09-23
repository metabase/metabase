---
title: Tests gated on drivers or app-DB features pass with 0 assertions in a default local run, so "green locally" and "fails without the fix" checks prove nothing
slug: driver-gated-tests-silently-skip-locally
kind: test-harness
impact: both
severity: medium
status: open
area: mt/test-drivers + mt/normal-drivers-with-feature, (when (not= :h2 (mdb/db-type)) ...), (when (search/supports-index?) ...) guards; ./bin/test-agent default DRIVERS=h2
occurrences:
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-fix-app-db-rollback-only/31b066ea-d480-4a3f-a6f1-0bc74a18367f.jsonl
    lines: 1150-1159, 2062-2066, 2118, 2245
    date: 2026-08-25
    jev: {self_inflicted_bug: 0.95, tool_misuse: 0.69, misleading_signal: 0.88, user_correction: 0.84, codebase_trap: 0.77, flailing: 0.62, env_friction: 0.84}
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase/025e8586-a280-4a50-ae6c-ed98e5b728af.jsonl
    lines: 869
    date: 2026-09-20
    jev: {self_inflicted_bug: 0.87, tool_misuse: 0.58, misleading_signal: 0.87, user_correction: 0.26, codebase_trap: 0.67, flailing: 0.64, env_friction: 0.93}
---
## Summary
Many backend tests wrap their body in a guard: `mt/test-drivers (mt/normal-drivers-with-feature ...)`,
`(when (not= :h2 (mdb/db-type)))`, or `(when (search/supports-index?))`. When the guard is false, clojure.test
reports the test as passed with 0 assertions and nothing marks it as skipped. `./bin/test-agent` defaults to
`DRIVERS=h2` and to the local app DB, so an agent's "tests pass" and "the test has teeth" checks can both run
nothing. In session 31b066ea this happened twice. A new regression test was skipped. Six leaking transform tests ran
only in driver CI jobs, so the local runs never saw them.

## Symptom
```
L1156 [RESULT] Running tests in [metabase.app-db.cluster-lock-test/out-of-band-insert-commits-without-help-from-the-pool-test]
Ran 1 tests in 4.269 seconds
0 assertions, 0 failures, 0 errors.
All tests passed.
L1159 [ASSISTANT] **0 assertions — it's being skipped.** The local app DB is H2, so the `not= :h2` guard skips it (and the existing checkout test too).
```
and
```
L2063 [RESULT] --- transform-test alone (mysql driver) ---
387 assertions, 3 failures, 0 errors
--- transform-test alone (h2 driver, default) ---
109 assertions, 0 failures, 0 errors
```

## Timeline
- L1150-1151: the new cluster-lock regression test "passes" (40 assertions for the namespace).
- L1154-1159: the agent reverts the fix to check that the test fails without it. It gets `0 assertions, 0 failures`
  and "All tests passed", and only then realises the test is skipped.
- L1172-1198: to exercise the test, the agent needs a Postgres app DB (see
  `local-test-appdb-differs-per-worktree-lein-env`).
- L2062-2066, L2118: `transform-test` runs 386 assertions under `DRIVERS=mysql` but 109 under H2. "many transform
  tests are skipped on H2 entirely, which is why it looked driver-specific."
- L2245 (commit message): "These were missed the first time because `mt/normal-drivers-with-feature
  :transforms/table` skips them on H2, so only a driver run reaches them."
- 025e8586 L869: "MariaDB skipped the test — the appdb search index only supports `#{:postgres :h2}`".

## Root cause
Guards return `nil` instead of marking the test as skipped. Hawk and clojure.test count a test with no assertions
as passing. `test-agent` prints a total assertion count, but agents compare pass/fail, not counts.

## Why agents fall for it
"All tests passed" is the natural success signal. The "fails without the fix" check is the right habit, but an
agent that sees "0 failures" can read it as "the test does not detect the bug" rather than "the test did not run".
Nothing prints the skip.

## Current state
Still present. For example, `mt/normal-drivers-with-feature :transforms/table` gating in
`test/metabase/transforms_rest/api/transform_test.clj`, and the `(when (search/supports-index?) ...)` wrapper in
`test/metabase/search/appdb/index_test.clj` (around the orphan and sweep tests). No CLAUDE.md or memory note warns
that a 0-assertion result means the test was skipped. Memory `reference_local_test_agent_uses_postgres.md` mentions
"A test guarded by `search/supports-index?` reports '0 assertions' there" for MySQL only.

## Suggested fix
- Have `./bin/test-agent` print, when `:only` names a single var, a loud `WARNING: <var> ran 0 assertions (likely
  skipped by a driver/app-db guard)`, and exit nonzero when every selected test ran 0 assertions.
- Add a CLAUDE.md line: when checking that a test fails without the fix, confirm the assertion count is nonzero.
  Driver-gated tests need `--drivers=...`.

## Detection signal
- `0 assertions, 0 failures` in test-agent output right after a "revert fix to prove teeth" step.
- Assertion counts for the same namespace that differ widely between two runs.
- Static check: a new `deftest` whose whole body sits inside a driver or app-DB guard.

## Raw excerpts
```
L2118 [ASSISTANT] No `with-model-cleanup` anywhere in the namespace, and many `POST "transform"` calls that create durable Transforms. Also notable: on H2 only 109 assertions run vs 386 under mysql — many transform tests are skipped on H2 entirely, which is why it looked driver-specific.
L2245 commit: These were missed the first time because `mt/normal-drivers-with-feature :transforms/table` skips them on H2, so only a driver run reaches them.
```
