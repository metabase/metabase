---
title: When the local pgvector container has exited, entity-retrieval tests fail with c3p0 "attempt ... to checkout a Connection has timed out", which reads as pool exhaustion rather than "server not running"
slug: pgvector-down-surfaces-as-pool-checkout-timeout
kind: misleading-signal
impact: wasted-time
severity: low
status: open
area: enterprise/backend/src/metabase_enterprise/semantic_search/db/datasource.clj (c3p0, checkoutTimeout 10000); local Docker container pgvector-semantic-test on :55432; semantic_search test_util
occurrences:
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-pr-03-llm-config/93bd1b32-5bde-4582-9d8a-53740b3387ef.jsonl
    lines: 2664-2704
    date: 2026-08-30
    jev: {not directly flagged; between chunks 8 and 10 of this session}
---
## Summary
After a docstring-only commit, `./bin/test-agent :module enterprise/entity-retrieval` started failing with errors
in 5+ tests at `SqlUtils.java:82`: `An attempt by a client to checkout a Connection has timed out`. The agent
put it down to "Connection-pool exhaustion — environmental, from hammering the same local Postgres across four
worktrees all session" and reran, which failed the same way. Only a `docker ps` / `psql -p 55432` check showed
that the `pgvector-semantic-test` container had exited 45 minutes earlier. `docker start` fixed it.

## Symptom
```
L2668 ERROR in metabase-enterprise.entity-retrieval.core-test/doc-type-boost-breaks-ties-test (SqlUtils.java:82)
L2680 clojure.lang.ExceptionInfo: An attempt by a client to checkout a Connection has timed out.
L2683 [ASSISTANT] Connection-pool exhaustion — environmental, from hammering the same local Postgres across four worktrees all session. Let me let it settle and rerun.
L2688 psql: error: connection to server at "localhost" (127.0.0.1), port 55432 failed: Connection refused
L2693 pgvector-semantic-test	Exited (0) 45 minutes ago
```

## Timeline
- L2667-2668: tests error right after an amend.
- L2671: "Docstring changes can't cause SQL errors — let me look."
- L2683-2685: misdiagnosis and a pointless rerun.
- L2687-2693: port check shows refused; container exited.
- L2695-2702: `docker start`; 66/284 green.

## Root cause
The pgvector datasource is a c3p0 pool with `checkoutTimeout` 10000
(`semantic_search/db/datasource.clj:78`). c3p0 retries acquisition in the background and reports only the
checkout timeout to callers. The underlying `Connection refused` is buried or only logged. The test utility
(`enterprise/backend/test/metabase_enterprise/semantic_search/test_util.clj:64`) skips pgvector tests only when
`MB_PGVECTOR_DB_URL` is blank, not when the server is unreachable.

## Why agents fall for it
"Checkout timed out" is the textbook pool-exhaustion message, and the session really was running tests in four
worktrees. Nothing in the error names the host or port.

## Current state
Unchanged on master (datasource.clj:78, test_util.clj:64). The container and port are recorded in memory
`reference_local_test_appdb_migration_reset.md` ("pgvector store is separate: Docker on port 55432 ...
recreated as `pgvector-semantic-test`"), but the memory doesn't give this symptom.

## Suggested fix
- In the semantic-search test fixture, do a one-shot plain JDBC `DriverManager/getConnection` (short login timeout) before building the pool, and fail with "pgvector at <url> unreachable (is the pgvector-semantic-test container running?)".
- Or set c3p0 `acquireRetryAttempts` low in tests so the root cause surfaces.
- Add the symptom → `docker start pgvector-semantic-test` mapping to the memory note.

## Detection signal
Transcript: "checkout a Connection has timed out" in entity-retrieval / semantic_search tests. A preflight
`nc -z localhost 55432` before those modules run.

## Raw excerpts
See Symptom.

## Additional occurrence
- transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-80394-metabot-tennant/b31b1fd7-7c96-47c9-95ad-9bfbd57f1c09.jsonl (deleted; reconstructed from redacted chunks)
  lines: 264-271
  date: 2026-08-21
  jev: {self_inflicted_bug: 0.75, tool_misuse: 0.89, misleading_signal: 0.68, user_correction: 0.82, codebase_trap: 0.68, flailing: 0.46, env_friction: 0.85}
- transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-80394-metabot-tennant/f6535e97-e0e1-4040-958e-3a5295bd2b0f.jsonl (deleted; reconstructed from redacted chunks)
  lines: 148-168
  date: 2026-08-21
  jev: {self_inflicted_bug: 0.92, tool_misuse: 0.89, misleading_signal: 0.56, user_correction: 0.88, codebase_trap: 0.83, flailing: 0.32, env_friction: 0.84}

The same c3p0 symptom with the **main app DB**. The local Homebrew Postgres 14 on :5432 that `./bin/test-agent` uses (see memory
`reference_local_test_agent_uses_postgres.md`) was not running. Test namespace loading died with
`A client timed out while waiting to acquire a resource from com.mchange.v2.resourcepool.BasicResourcePool@... -- timeout at awaitAvailable()`.

- b31b1fd7 L265-269: the agent misdiagnosed it the same way as the pgvector case: "Connection-pool timeout against the shared local
  Postgres (probably other sessions holding it). Retrying on H2." It switched to `MB_DB_TYPE=h2` for the rest of the session
  (L270, L438, L443). The tests passed, but the cause was never found.
- f6535e97 L149-165 (later the same day): same error. This time the agent checked `pg_isready -h localhost` -> "localhost:5432 - no response",
  read `~/bin/start-postgres` (`/opt/homebrew/opt/postgresql@14/bin/postgres -D /opt/homebrew/var/postgresql@14`), started it with nohup,
  and the tests passed (L167-168).

So the "pool exhaustion / other sessions" misreading recurs across both Postgres instances. Suggested fix: add a preflight TCP/JDBC check to
`bin/test-agent` (or the test app-db init) that fails with "app DB at localhost:5432 unreachable (run ~/bin/start-postgres)". Record the
symptom -> `pg_isready` -> `~/bin/start-postgres` mapping in the memory next to the pgvector one.
