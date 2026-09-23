---
title: `accepted-admin-emails` only mails admins who have a `last_login`, so `publish-refresh-error-event-sends-admin-email-test` passed or failed depending on whether an earlier test had logged in the shared admin, and an agent blamed a shared-inbox race instead
slug: admin-failure-email-skips-never-logged-in-admins
kind: test-harness
impact: wasted-time
severity: medium
status: fixed # 98aa767a98c gives the test its own admin and records a login
area: src/metabase/channel/db.clj `accepted-admin-emails`; test/metabase/model_persistence/task/persist_refresh_test.clj
occurrences:
  - transcript: ~/.claude/projects/-Users-andrei-src-mb/c9e08d36-c34d-4cc5-8d80-81c8c80b1f99.jsonl
    lines: 1743-1850
    date: 2026-09-11
    jev: {any_papercut: 0.74, env_toolchain: 0.65, stale_state: 0.14, verify_mismatch: 0.18, misleading_code: 0.14, hidden_coupling: 0.13, stale_docs: 0.11, tool_footgun: 0.74, flaky: 0.90, agent_bug: 0.28, wasted_effort: 0.35, user_correction: 0.18}
---
## Summary
Three app-DB CI shards (MariaDB, MySQL, Postgres Part 2) failed the same persist-refresh email test on a PR that never touched it. The agent read `(is (= 1 (count msgs)))` on the fake inbox and diagnosed a shared-inbox race under parallel execution; a rerun passed. The real cause, fixed upstream days later: the failure email goes only to active superusers with a non-nil `last_login`, and the test relied on the shared test admin, whose `last_login` is set only as a side effect of some earlier test logging in.

## Symptom
L1744: `failure: metabase.model-persistence.task.persist-refresh-test / publish-refresh-error-event-sends-admin-email-test` on MariaDB and MySQL; L1779: the user points out six failing checks; L1810: the agent attributes the failure to the exact message count asserted on a shared global fake inbox; L1814: the user asks whether the change is really unrelated.

## Timeline
- L1743-L1756: failing test found on two shards; master's app-db jobs green.
- L1761-L1772: rerun-and-watch loop.
- L1779-L1810: third shard also red; shared-inbox theory.
- L1814-L1839: the user asks for proof; the agent shows no code path from the diff reaches the test.
- L1847: rerun green.
- Cost: a CI rerun, about ten calls and two extra user round trips; the recorded diagnosis was wrong.

## Root cause
`metabase.channel.db/accepted-admin-emails` filters `:last_login [:not= nil]`; the test used the shared admin fixture, so whether it got the email depended on test ordering. The fix creates a dedicated admin and sets `last_login`.

## Why agents fall for it
The filter lives in a helper named for "accepted" admins, far from the test; an exact count on a global inbox looks like the obvious flake source, and a green rerun seems to confirm it.

## Current state
origin/master src/metabase/channel/db.clj:47-55: "The emails of the active personal superusers who have logged in at least once"; the test now creates its own superuser and runs `(t2/update! :model/User (:id admin) {:last_login :%now})`.

## Suggested fix
- Done upstream for this test. Generalize: test helpers that create admins for email assertions should set `last_login`, or `mt/with-fake-inbox` could warn when superusers without `last_login` exist.
- Agent habit: a flake diagnosis should name the mechanism in the code, not a generic race pattern.

## Detection signal
Admin-notification email tests failing with `(= 1 (count msgs))` expected 1, actual 0, on some shards only.

## Raw excerpts
```
L1744 [RESULT] ### mariadb (    4296 lines) ⏎ …[ci-conductor]   failure: metabase.model-persistence.task.persist-refresh-test / publish-refresh-error-event-sends-admin-email-test ⏎ … 44624 assertions, 4 failures, 0 errors.
L1756 [RESULT] master 236c7c98f30: app-db jobs ->    8     8 success ⏎ master 34ff3598e37: app-db jobs ->   16 success …
L1847 [RESULT] … CYCLE 1 failing: app-db-tests / MariaDB Latest EE App DB Tests (Part 2)|app-db-tests / MySQL 9 EE App DB Tests (Part 2)|app-db-tests / Postgres Latest EE App DB Tests (Part 2)|… ⏎ CYCLE 2: ALL GREEN (backport gate excluded)
```
