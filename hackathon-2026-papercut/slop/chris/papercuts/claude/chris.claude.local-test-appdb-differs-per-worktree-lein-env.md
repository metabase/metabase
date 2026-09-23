---
title: The local test app DB silently depends on a gitignored .lein-env (Postgres, hosted token, encryption) in the main checkout and on H2 in fresh worktrees, and the test banner names only the warehouse driver
slug: local-test-appdb-differs-per-worktree-lein-env
kind: test-harness
impact: wasted-time
severity: high
status: documented-still-hit
area: .lein-env (gitignored), ./bin/test-agent, test initialization; worktrees under ~/workspace/metabase
occurrences:
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase/025e8586-a280-4a50-ae6c-ed98e5b728af.jsonl
    lines: 779-857
    date: 2026-09-20
    jev: {self_inflicted_bug: 0.87, tool_misuse: 0.58, misleading_signal: 0.87, user_correction: 0.26, codebase_trap: 0.67, flailing: 0.64, env_friction: 0.93}
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-fix-app-db-rollback-only/31b066ea-d480-4a3f-a6f1-0bc74a18367f.jsonl
    lines: 1150-1198
    date: 2026-08-25
    jev: {self_inflicted_bug: 0.95, tool_misuse: 0.69, misleading_signal: 0.88, user_correction: 0.84, codebase_trap: 0.77, flailing: 0.62, env_friction: 0.84}
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-boost-metabot-library-selection/1dece064-f6c3-42cc-b09d-dc78ef3603ff.jsonl
    lines: 516-562
    date: 2026-09-16
    jev: {self_inflicted_bug: 0.95, tool_misuse: 0.87, misleading_signal: 0.75, user_correction: 0.86, codebase_trap: 0.76, flailing: 0.44, env_friction: 0.90}
---
## Summary
Which app DB `./bin/test-agent` uses depends on a gitignored `.lein-env`, and that file differs between checkouts:
- **Main checkout** (`~/workspace/metabase/metabase`): `.lein-env` sets `:mb-db-type "postgres"` on localhost:5432,
  db `metabase`. That database is persistent, encrypted (it needs `MB_ENCRYPTION_SECRET_KEY`), and stores a hosted
  premium token.
- **Fresh worktrees** (`metabase.<branch>`): no `.lein-env`, so the app DB is H2.

The run banner prints `Running QP tests against these drivers: #{:h2}`, which names the *warehouse* driver. Agents
read it as the app DB. The same test can therefore behave differently depending on which directory the agent is in.
Agents draw wrong conclusions ("doesn't reproduce on H2") or chase local-only failures (hosted-token validation).

## Symptom
- 025e8586 L820: "**Timofei's stated mechanism does not reproduce.** On this H2, `DROP TABLE` inside a transaction
  is transactional". The run was actually on Postgres. L839: "`.lein-env` points the app db at **postgres**, so my
  earlier runs were postgres, not H2." With `MB_DB_TYPE=h2` it reproduced at once (L848-857): "My postgres run misled
  me; he was right."
- 31b066ea L1159: in the worktree the app DB *was* H2, so `cluster-lock-test` guarded tests skipped (0 assertions).
  Pointing at local Postgres then failed (L1176): `Database is encrypted but the MB_ENCRYPTION_SECRET_KEY environment
  variable was NOT set`. The agent created a throwaway scratch database to work around it (L1179-1187).
- 1dece064 L516-555: `metabase.search.appdb.scoring-test/library-test` errors locally. The hosted token in the
  persistent app DB enables `:library`, and library validation rejects the test's sub-collection. The agent recorded
  a new memory, `reference_scoring_library_test_fails_locally.md`.

## Timeline
- 025e8586 L779-799: the fix passes and the control fails, but with no savepoint error. The agent concludes H2 DDL
  is transactional and tells the user that the teammate's diagnosis is wrong.
- L829: the user asks "what about postgres and mysql".
- L833-835: `cat .lein-env` shows `:mb-db-type "postgres"`.
- L847-857: `MB_DB_TYPE=h2 MB_DB_FILE=/tmp/... ./bin/test-agent ...` reproduces the exact CI failure.
- 31b066ea L1160-1161: `cat .lein-env` gives nothing and `env | grep MB_DB` gives nothing, so the worktree uses H2.
- L1172-1176: `MB_DB_TYPE=postgres ... MB_DB_DBNAME=metabase` fails with the encrypted-DB error.
- L1180-1187: a fresh `mb_clusterlock_scratch` DB gives 71 assertions against 40 on H2, so the guarded tests ran.

## Root cause
The environment is invisible and varies by checkout. `.lein-env` is gitignored and not copied into worktrees. The
persistent local Postgres app DB builds up state (encryption, a hosted token) that CI never has. `./bin/test-agent`
does not print which app DB it connected to.

## Why agents fall for it
The only DB line in the banner mentions `:h2`. CLAUDE.md "Running Backend Tests" says nothing about the app DB. The
app DB differs by directory, so a memory that says "test-agent uses postgres" is wrong in worktrees.

## Current state
- Main checkout: `.lein-env:5` `:mb-db-type   "postgres"` (checked 2026-09-23).
- Memories: `reference_local_test_agent_uses_postgres.md` (written in session 025e8586 after the incident),
  `reference_local_test_appdb_is_hosted.md`, `reference_local_test_appdb_migration_reset.md`,
  `reference_scoring_library_test_fails_locally.md`, and `reference_evals_local_canonical_lane.md` (blank
  `MB_ENCRYPTION_SECRET_KEY`). None of them says that worktrees fall back to H2. The project CLAUDE.md does not
  mention the app DB at all.
- Documented, and still hit in all three sessions. Two of the three sessions came before the postgres memory was
  written.

## Suggested fix
- Have `./bin/test-agent` (or the test initializer) print `App DB: postgres @ localhost:5432/metabase (from
  .lein-env)` or `App DB: h2 (default)` next to the drivers line. Consider renaming the drivers line to
  "Warehouse drivers".
- Add a CLAUDE.md paragraph: the app DB comes from `.lein-env` or `MB_DB_TYPE`. Worktrees default to H2. For
  app-DB-specific behaviour, run each backend explicitly with `MB_DB_TYPE=...`.
- Optionally have `test-agent` refuse or warn when the persistent app DB carries a premium token or encryption that
  CI would not have.

## Detection signal
- A transcript that says "doesn't reproduce on H2" with no `MB_DB_TYPE` in the command and a `.lein-env` in the cwd.
- `Database is encrypted but the MB_ENCRYPTION_SECRET_KEY` in test output.
- Assertion counts that differ between two runs of the same namespace when the only difference is the working
  directory.

## Raw excerpts
```
025e8586 L835 [RESULT] {
 :mb-db-type   "postgres"
 :mb-db-host   "localhost"
 :mb-db-user   "christruter"
 :mb-db-dbname "metabase"
 ...
L839 [ASSISTANT] That changes things — `.lein-env` points the app db at **postgres**, so my earlier runs were postgres, not H2. Let me redo this properly across all four.
L857 [ASSISTANT] Reproduced on H2 — exactly Timofei's failure. My postgres run misled me; he was right.

31b066ea L1159 [ASSISTANT] **0 assertions — it's being skipped.** The local app DB is H2, so the `not= :h2` guard skips it
L1176 [RESULT] [main] FATAL metabase.test.initialize - Error initializing :db
clojure.lang.ExceptionInfo: Database is encrypted but the MB_ENCRYPTION_SECRET_KEY environment variable was NOT set {}
L1179 [ASSISTANT] The local Postgres app DB is encrypted and I don't have the key. Rather than chase that, spinning up a throwaway unencrypted DB
```

## Additional occurrence
- transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-slackbot-uploads-cleanup/1843e5b3-3fe3-44ac-9b08-6979092176bc.jsonl
  lines: 446-550
  date: 2026-09-12 (approx.)
  jev: {self_inflicted_bug: 0.94, tool_misuse: 0.87, misleading_signal: 0.66, user_correction: 0.14, codebase_trap: 0.54, flailing: 0.80, env_friction: 0.91}

A worktree (`metabase.slackbot-uploads-cleanup`) that *did* have a `.lein-env` (Postgres, encrypted, `MB_ENCRYPTION_SECRET_KEY` set). `metabase.slackbot.uploads-test` uses `encryption-tu/with-encrypted-app-db-fixture` as its `:once` fixture, which re-encrypts the app DB with its own test key. It failed before running any test: `ERROR ... during :clojure.test/once-fixtures (encryption.clj:390) ... Database was encrypted with a different key than the MB_ENCRYPTION_SECRET_KEY environment contains` / `Ran 0 tests` (L451-460).
It took five runs to find the combination that works:
1. L474 `MB_DB_TYPE=h2 MB_DB_HOST= MB_DB_DBNAME= MB_DB_USER=`: same error (key still set).
2. L481 `MB_DB_TYPE=h2` only: same error.
3. L495-499: a master control worktree with the `.lein-env` symlinked in: same error, so pre-existing (a good call).
4. L526/545 `MB_ENCRYPTION_SECRET_KEY=""` (on Postgres): `Database is encrypted but the MB_ENCRYPTION_SECRET_KEY environment variable was NOT set`.
5. L549 `MB_ENCRYPTION_SECRET_KEY="" MB_DB_TYPE=h2 MB_DB_DBNAME="mem:slackbot-check;DB_CLOSE_DELAY=-1"`: 19 tests, 100 assertions, pass.
At L463 the agent read `reference_local_test_appdb_migration_reset.md`, but at that time the memory did not mention encryption (the `--full` render of L464 contains no "encrypt"). The paragraph "`with-encrypted-app-db-fixture` can never pass against the shared Postgres app-db" with the full env prefix is in the memory now (lines 52-61), so this is **documented now**. A later session (boost-metabot-library-selection 83b14905 L101-105) read the memory and used the full prefix on the first try.
