---
title: Test-data helpers (user->id, username->token, mt/id, personal collections) create or cache durable state inside the ambient with-temp transaction; under rollback-only it replays, races, leaks tokens and bumps last_login
slug: test-helpers-create-durable-state-inside-rollback-scope
kind: codebase-trap
impact: both
severity: high
status: fixed
area: test harness -- test/metabase/test/data/users.clj, test/metabase/test/data/impl.clj, test/metabase/test/redefs.clj
occurrences:
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-fix-app-db-rollback-only/a4d08ba6-bcae-4d25-a47f-150cf6e80cfc.jsonl
    lines: 1008-1266, 1806-1944, 2092, 2317-2505
    date: 2026-08-21..24
    jev: {self_inflicted_bug: 0.97, tool_misuse: 0.23, misleading_signal: 0.88, user_correction: 0.14, codebase_trap: 0.87, flailing: 0.37, env_friction: 0.61}
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-fix-app-db-rollback-only/a4d08ba6-bcae-4d25-a47f-150cf6e80cfc/subagents/agent-a60c5f8ae48a8cd91.jsonl
    lines: 629-883
    date: 2026-08-24
    jev: {self_inflicted_bug: 0.97, tool_misuse: 0.88, misleading_signal: 0.77, user_correction: 0.08, codebase_trap: 0.75, flailing: 0.77, env_friction: 0.81}
---
## Summary
Several test helpers were written assuming that whatever they create the first time commits and stays:
`user->id` creates the test users (and deliberately skips its memo inside a transaction), `username->token` caches a
session token regardless of transaction, `authenticate!` inserts a Session whose after-insert hook bumps
`User.last_login`, `mt/id` bypasses its cache inside a transaction, and `user->personal-collection` is a
get-or-create. Once PR #80065 made `with-temp` truly rollback-only, each first creation inside a test's with-temp
rolled back and was replayed by the next test -- producing 401 treadmills, `last_login` mismatches, lock timeouts
between `^:parallel` tests racing to INSERT rasta, and extra queries inside `with-call-count` windows. Each surfaced
as a different, apparently unrelated test failure, and the agent guessed the wrong mechanism several times per
failure.

## Symptom
- `pulse.api.pulse-test/list-test` and `create-csv-xls-test`: `diff: - {:creator {:last_login ...10:29:33}} + {:creator {:last_login ...10:29:38}}` (L1038, L1209).
- Probe at L1227: ~150 `PROBE authenticate! :rasta in-transaction? true test send-test-pulse-test` lines in one namespace run.
- `xrays.related-test`: `Timeout trying to lock table {0}; SQL statement: INSERT INTO "CORE_USER" ...` in four `^:parallel` tests (L2333).
- `sandbox.api.util-test/sandbox-caching-test`: `expected: (zero? (call-count)) actual: (not (zero? 1))` (L1806) -- the extra query was the test's own `(mt/id :venues)`.

## Timeline
- L1057 agent correctly suspects session-token cache after namespace-level control.
- L1189-1221 "pre-warm session tokens at init" experiment: "It moved the failure instead of removing it". Reverted.
- L1218-1227 probe in `authenticate!` shows re-auth inside transactions throughout the namespace.
- L1806-1944 `sandbox-caching-test`: agent bisects across five commits, guessing cluster-lock then pre-warm ("My second theory in a row on this test, also wrong"); fails at the pre-fix head too.
- L2092 commit `619bfc8c457` "Resolve the venues id before counting queries": "Inside a transaction the test-data id lookup deliberately skips its memo, so the call lands" inside the counted window.
- L2358-2479 `related-test` CORE_USER lock timeouts; agent first thinks its new `^:parallel` test caused it, then that it is pre-existing (read a partial log, L2427), then master control shows branch-caused. Stack: `mt/with-temp -> with-temp-defaults -> rasta-id -> user->id -> users.clj:108 (the in-transaction branch) -> fetch-or-create-user! -> INSERT CORE_USER`. Fix: `(use-fixtures :once (fixtures/initialize :test-users))`.
- Subagent L790-842: `get-series-for-card-permission-test` used `(t2/select-one-pk :model/Collection :personal_owner_id ...)`; when the personal collection row had been rolled back, `collection_id` was nil, the card landed in the root collection, and the permission test silently got 200 instead of 403.

## Root cause
Get-or-create of durable singletons (test users, sessions, personal collections, test-data ids, lock rows) executed
inside whatever transaction the caller holds. The code comments assume "first creation commits". Under rollback-only
the creation replays forever, under concurrency. See memory `reference_rollback_only_cache_pattern.md`:
"get-or-create of a durable singleton, executed inside the ambient transaction ... The cure is always the same:
create it before the transaction opens, or on a connection of its own."

## Why agents fall for it
The failures look unrelated (timestamps, 401s, lock timeouts, query counts, permission 200-vs-403). Each helper's
transaction-sensitivity is buried in a `let` over atoms (users.clj:99-114) or a `(if (mdb/in-transaction?) ...)`
branch (impl.clj:86, 171, 179, 437). Standalone controls are also misleading (see
`standalone-test-controls-mislead-about-branch-regressions`).

## Current state
Mitigated in master:
- `test/metabase/test/redefs.clj:30-55` now materializes the test-data Database, test users and personal collections
  *before* the top-level with-temp opens its transaction (comments explain why).
- `test/metabase/test/data/users.clj:177-186` token cache keyed on `[(mdb/unique-identifier) username]`;
  users.clj:189-192 comment describes the remaining rollback case; users.clj:211-213 evicts only the one user's
  token on the final 401 retry.
- `enterprise/backend/test/metabase_enterprise/sandbox/api/util_test.clj:19-21` comment: "Within a `with-temp`
  transaction, test-data ID lookups intentionally bypass their cache, so `(mt/id :venues)` executes another query."
- `user->id` still creates users inside a transaction when not yet created globally (users.clj:103-114); the prewarm
  in redefs.clj is what keeps that from happening in practice.
Documented: memory `reference_rollback_only_cache_pattern.md` (seven mechanisms).

## Suggested fix
Make the helpers themselves transaction-safe rather than relying on the redefs prewarm: create test users / sessions
on a dedicated connection (`with-unshared-connection`-style) or refuse to create inside a transaction with a clear
error. Add a hawk `before-run` hook to initialize `:test-users` once per JVM.

## Detection signal
- `last_login` diffs, `Timeout trying to lock table ... INSERT INTO "CORE_USER"`, or `with-call-count` off-by-one in
  a branch that touches transaction semantics.
- Agent runs several bisect/probe rounds on one test with "theory N was wrong" language.

## Raw excerpts
```
L1227 [RESULT] 9:PROBE authenticate! :rasta in-transaction? true test send-test-pulse-test
10:PROBE authenticate! :crowberto in-transaction? true test update-collection-id-test
11:PROBE authenticate! :rasta in-transaction? false test form-input-slack-test
...
150:PROBE authenticate! :rasta in-transaction? true test send-test-pulse-validate-emails-test
FAIL in metabase.pulse.api.pulse-test/list-test (pulse_test.clj:936)
```
```
L2479 assistant: `user->id` deliberately skips its memo inside a transaction, so it *creates* the test users there.
On master those inserts committed, so the first test paid for it once. On this branch they roll back with the scope,
so every parallel test re-creates them -- and several threads race to insert rasta, one holds the lock, the rest time out.
```
```
L1109 subagent: 3. ... re-authentication bumps `last_login` not via the session endpoint ... but via the model hook
-- `t2/define-after-insert :model/Session` publishes `:event/user-login` (`src/metabase/session/models/session.clj:102-109`),
whose handler does `t2/update! :model/User {:last_login :%now}` (`src/metabase/users/events/last_login.clj:17`).
```
