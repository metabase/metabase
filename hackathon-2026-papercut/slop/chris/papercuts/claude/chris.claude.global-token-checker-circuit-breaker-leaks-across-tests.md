---
title: The global token checker's circuit breaker carries state across the test JVM; adding unrelated test namespaces reshuffled CI partitions and broke token-check-test
slug: global-token-checker-circuit-breaker-leaks-across-tests
kind: test-harness
impact: wasted-time
severity: medium
status: fixed
area: src/metabase/premium_features/token_check.clj (token-checker, circuit-breaker-token-checker), test/metabase/premium_features/token_check_test.clj, CI App DB Tests partitioning
occurrences:
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-module-resolver/7a939669-dffc-4b10-94a3-de8030e0b2d5.jsonl
    lines: 1105-1230
    date: 2026-09-11 (approx)
    jev: {self_inflicted_bug: 0.97, tool_misuse: 0.89, misleading_signal: 0.82, user_correction: 0.11, codebase_trap: 0.56, flailing: 0.55, env_friction: 0.92}
---
## Summary
PR #82301 (nested module resolution, no premium-features code) failed `Java 25 EE/OSS App DB Tests (Part 2)` on every commit. The failures were five tests in `metabase.premium-features.token-check-test`, all returning "Token validation is currently unavailable." That message is thrown when the global `token-checker`'s diehard circuit breaker is open (10 failures in 60s). The breaker is a JVM-wide singleton, so any earlier test in the same JVM that made failing token checks opens it. CI splits the suite in two by test count ("Running tests in partition 2 of 2 (6491 tests of 12971)"), so the PR's new test namespaces moved the boundary and landed `token-check-test` behind a breaker-tripping test. The tests pass in isolation and on master.

## Symptom
```
✗ metabase.premium-features.token-check-test/fetch-token-caches-invalid-responses (failed in 2 jobs)
    For 4XX responses, the result is cached  expected: 1  actual: 0
✗ .../fetch-token-does-not-call-db-when-cached   expected: (some zero? call-counts) actual: (not (some ... (1 1 1)))
   ... :error-details "Token validation is currently unavailable."
```
Postgres/MariaDB/MySQL Part 2 passed on the same PR; only the Java 25 H2 jobs failed.

## Timeline
- L1105 user: "ci-status". L1140: ci-failures lists 7 red checks.
- L1130: "fails on all three PR commits, including one predating my changes".
- L1145-1153: local token-check tests pass.
- L1169-1177: fails only on this PR, from its first commit; master passes.
- L1192: "The test-count-based partitioning means this PR's new namespaces shift the boundary, landing `token-check-test` in a JVM where prior tests leave the token check unavailable".
- L1193-1194: `token_check.clj:332` throws "Token validation is currently unavailable." from `CircuitBreakerOpenException`; the test file already had a comment at :182 "no circuit breaker — it carries state between runs and causes flakes".
- L1207: diagnosis reported; L1210 user: "let's make that fix".
- L1228-1229: agent writes a throwaway `aaa_trip_breaker_scratch_test` to reproduce by tripping the global breaker first, then builds a breaker-free checker for those tests.

## Root cause
Shared mutable singleton (`token-check/token-checker` wraps `circuit-breaker-token-checker` with a JVM-lifetime breaker) used directly by tests, combined with order-dependent partitioning by test count. Unrelated PRs that add tests change which tests share a JVM.

## Why agents fall for it
A failure that appears "because of" a PR, on every commit, strongly suggests the PR caused it. Local isolated runs pass. The ci-failures output shows only the assertion diffs; the breaker message is buried in `:error-details`.

## Current state
Fixed for this file on master (d3a5a218a55): test/metabase/premium_features/token_check_test.clj:27-28 now builds "A token checker with production TTLs and no circuit breaker. The global checker's breaker is shared across the JVM, and one tripped by an earlier test would fail every check here." The global breaker still exists (src/metabase/premium_features/token_check.clj:548-551, `:failure-threshold-ratio-in-period [10 10 (u/seconds->ms 60)]`), so any other test that calls `token-check/check-token` through the global checker is still exposed. Memory has related "order-dependent" notes (metabot api-test, persist-refresh) but not this one.

## Suggested fix
- A test fixture that resets/rebuilds the global checker's breaker (or binds a breaker-free checker) for every test namespace, e.g. in `metabase.test.fixtures` or a `:once` fixture in premium-features tests.
- Or make the breaker a dynamic/resettable var and reset it in the test runner between namespaces.
- CI: when a failure appears only in one partition and the test passes in isolation, the ci-failures script could print "partition-sensitive: rerun locally with the partition's preceding namespaces".

## Detection signal
- Test failure text containing "Token validation is currently unavailable" in CI.
- PR-level: failures confined to test namespaces the PR doesn't touch, on every commit, only in one partitioned job.

## Raw excerpts
```
L1196 Running tests in partition 2 of 2 (6491 tests of 12971)...
L1194 src/metabase/premium_features/token_check.clj:332:  (throw (ex-info (tru "Token validation is currently unavailable.")
      test/metabase/premium_features/token_check_test.clj:182: ;; no circuit breaker — it carries state between runs and causes flakes
L1207 **Why this PR triggers it:** these jobs split the entire suite (12,971 tests) into two halves by test count. This PR adds test namespaces, which moves the split, so `token-check-test` now lands in the half with tests that leave the global breaker open.
```
