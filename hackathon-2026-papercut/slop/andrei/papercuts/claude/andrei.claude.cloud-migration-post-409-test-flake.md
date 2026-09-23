---
title: `cloud-migration-test/migrate!-test` fails intermittently on app-DB jobs because `POST /api/cloud-migration` returns 409 'There's an ongoing migration already' whenever any non-terminal cloud_migration row exists
slug: cloud-migration-post-409-test-flake
kind: test-harness
impact: wasted-time
severity: low
status: open # test and the instance-wide 409 check unchanged on master
area: test/metabase/cloud_migration/models/cloud_migration_test.clj (migrate!-test); src/metabase/cloud_migration/api.clj (POST /)
occurrences:
  - transcript: ~/.claude/projects/-Users-andrei-src-mb/fbd9d67a-1fb0-4afe-973d-ba7d8c5d19d1/subagents/agent-a6fd99bcc709d6e88.jsonl
    lines: 532-590
    date: 2026-09-17
    jev: {any_papercut: 0.71, env_toolchain: 0.20, stale_state: 0.23, verify_mismatch: 0.82, misleading_code: 0.28, hidden_coupling: 0.59, stale_docs: 0.30, tool_footgun: 0.36, flaky: 0.92, agent_bug: 0.34, wasted_effort: 0.58, user_correction: 0.23}
---
## Summary
On a Metabot PR, 'MariaDB Latest EE App DB Tests (Part 1)' failed with `POST /api/cloud-migration expected a status code of 200, got 409. Response body: There's an ongoing migration already.` followed by an ERROR in the same test. The agent searched issues, surveyed failures on other PRs' runs, ran the namespace locally (7 tests green) and reran the job, which passed.

## Symptom
L539-L558: `FAIL in metabase.cloud-migration.models.cloud-migration-test/migrate!-test (http_client.clj:273)`, `POST /api/cloud-migration expected a status code of 200, got 409.`, `Response body: There's an ongoing migration already.`

## Timeline
- L532-L539: failing job found and log downloaded.
- L545-L558: issue search, quarantine gate output, test source and API read.
- L561-L573: failures on other PRs' runs surveyed.
- L576-L590: namespace passes locally.
- L621-L630: rerun of failed jobs passes.
- Cost: about 5 minutes of investigation (09:51 to 09:55) plus a CI rerun.

## Root cause
Not established in the session. The endpoint refuses while any cloud_migration row is outside the terminal states, which is instance-wide state; a row left by an earlier test, or a background `migrate!` future started by the POST outliving the test's `with-redefs`, would produce exactly this 409. Unverified.

## Why agents fall for it
It passes alone and on rerun, and nothing in the failure says which earlier row blocked the POST.

## Current state
Checked origin/master: `migrate!-test` still starts with a POST through `mock-external-calls!` (a `with-redefs`), and the API still returns 409 when `cloud-migration-not-in-states terminal-states` finds a row.

## Suggested fix
- Clear or finish cloud_migration rows in a fixture before and after each test in the namespace.
- Include the blocking row's id and state in the 409 body so test failures show the leftover.

## Detection signal
`expected a status code of 200, got 409` with `There's an ongoing migration already.` in a test log.

## Raw excerpts
```
L538 [CALL] Bash: cd <scratchpad> && sed 's/\x1b\[[0-9;]*m//g' mariadb-job.log > mariadb-job.clean.log && /usr/bin/grep -a -n "FAIL in\|ERROR in" mariadb-job.cl
L539 [RESULT] 1792:2026-09-17T09:39:19.3248067Z FAIL in metabase.cloud-migration.models.cloud-migration-test/migrate!-test (http_client.clj:273)
    1802:2026-09-17T09:39:19.3982865Z ERROR in metabase.cloud-migration.models.cloud-migration-test/migrate!-test (db.clj:53)
L558 [RESULT] 1792:2026-09-17T09:39:19.3248067Z FAIL in metabase.cloud-migration.models.cloud-migration-test/migrate!-test (http_client.clj:273)
    1796:2026-09-17T09:39:19.3259682Z POST /api/cloud-migration expected a status code of 200, got 409.
    1797:2026-09-17T09:39:19.3262012Z Response body: There's an ongoing migration already.
    1802:2026-09-17T09:39:19.3982865Z ERROR in metabase.cloud-migration.models.cloud-m [...3951 chars...] 7:    {:status 409 :body "There's an ongoing migration already."}
L590 [RESULT] 1466:Ran 7 tests in 19.349 seconds
    1467:23 assertions, 0 failures, 0 errors.
```
