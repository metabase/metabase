---
title: The first app-db test in a fresh worktree JVM took ~94s (Liquibase + class loading); the agent reported it as the test's CI cost and argued against a backport on that basis
slug: first-test-timing-includes-cold-start
kind: misleading-signal
impact: wasted-time
severity: low
status: open
area: bin/test-agent timing output, metabase.cmd.copy-test (setup-db! on H2), fresh worktrees
occurrences:
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-78704-copy-transform-models/9201d948-0009-4073-b8a4-a56cab4824a2.jsonl
    lines: 413-534
    date: 2026-09-10
    jev: {self_inflicted_bug: 0.89, tool_misuse: 0.95, misleading_signal: 0.71, user_correction: 0.62, codebase_trap: 0.35, flailing: 0.27, env_friction: 0.90}
---
## Summary
Deciding whether to backport only the tests of #82135 to release-x.58, the agent quoted a ~94s runtime for the new `metabase.cmd.copy-test` tests and used it as a "CI tax" objection. That number came from a single run in a fresh scratch worktree, where the first `setup-db!` pays Liquibase changelog parsing and class loading. Re-measured under the same conditions (L509-520), the marginal cost was ~5-7s. The agent retracted: "the ~94s CI figure was wrong. That was cold-start cost on a fresh worktree".

## Symptom
L505: `{:test 1, :pass 4 ... :duration 5002.4}` ("5 seconds, not 94", L508). L520: `LONG TEST in ... copied-tables-include-foreign-key-targets-test  Test took 5.998 seconds`, `Ran 2 tests in 7.423 seconds`.

## Root cause
test-agent/hawk report per-test durations and "LONG TEST" warnings that include one-time JVM/app-db initialisation charged to whichever test first touches it. In a fresh worktree (cold `.cpcache`, first migration run) that cost is large.

## Why agents fall for it
The runner prints a precise per-test number and flags it as LONG, which reads as the test's own cost.

## Current state
Unchanged; no doc or memory on it. `:test-warn-time` differs between runs (60000 vs 3000) depending on mode, so "LONG TEST" appears inconsistently.

## Suggested fix
Memory/CLAUDE.md line: "Per-test timings include one-time setup charged to the first test; measure a test's cost by running it twice in one JVM or subtracting a baseline run." Optionally have the test runner report setup time separately.

## Detection signal
An agent citing a single test-agent duration as a cost argument, from a run whose output also shows migrations/Liquibase or a fresh worktree.
