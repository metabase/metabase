---
title: mt/user-http-request given a User id/object wrapped the whole in-process request in a rollback-only with-temp Session, silently discarding every app-DB write the endpoint made
slug: user-http-request-non-keyword-user-runs-in-rollback-scope
kind: codebase-trap
impact: both
severity: high
status: fixed
area: test harness -- test/metabase/test/data/users.clj (user-request), test/metabase/test/redefs.clj (with-temp rollback-only)
occurrences:
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-fix-app-db-rollback-only/a4d08ba6-bcae-4d25-a47f-150cf6e80cfc.jsonl
    lines: 649-1192
    date: 2026-08-21
    jev: {self_inflicted_bug: 0.95, tool_misuse: 0.55, misleading_signal: 0.80, user_correction: 0.33, codebase_trap: 0.89, flailing: 0.76, env_friction: 0.57}
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-fix-app-db-rollback-only/a4d08ba6-bcae-4d25-a47f-150cf6e80cfc/subagents/agent-a60c5f8ae48a8cd91.jsonl
    lines: (first report, delivered to parent at L1109)
    date: 2026-08-21
    jev: {self_inflicted_bug: 0.97, tool_misuse: 0.88, misleading_signal: 0.77, user_correction: 0.08, codebase_trap: 0.75, flailing: 0.77, env_friction: 0.81}
---
## Summary
`mt/user-http-request` runs the ring handler in-process, on the calling thread. When the user argument is a
keyword (`:rasta`) it uses a cached session token. When it is a User id or object, `user-request` used to wrap the
*entire request* in `t2.with-temp/with-temp [:model/Session ...]`. Once PR #80065 made `with-temp`'s
`{:rollback-only true}` actually roll back, every app-DB write the endpoint made was discarded when the request
returned. The API still returned 200 and warehouse writes (separate connection) survived, so tests saw "missing"
rows with no error anywhere. The agent blamed the feature under test (action-v2 undo), filed a blocking issue
assigning it to another team with a made-up mechanism, and only a second agent's instrumentation found the
harness cause.

## Symptom
- `metabase-enterprise.action-v2.models.undo-test`: 25 failures on the branch, 0 on master. `"Nothing to do"` where
  undo output was expected, `next-batch-num` returning nil (L649).
- Also broke `queries-rest.api.card-test/reduced-fields-propagate-to-downstream-card-test` and the whole
  `transforms-rest.api.transform-test` namespace (L1192) -- all tests that pass a User object/id.

## Timeline
- L649 agent: "`track-change!` writes its snapshots in a nested `t2/with-transaction`, which is now a real savepoint
  scope inside the test's rollback-only outer transaction. I haven't worked out whether the writes get rolled back..."
  Plans to dispatch to module owner Gadget.
- L679-L757 writes issue body ("needs someone who knows action-v2") and files kata `xy73` labelled
  regression/blocking.
- L1011 user: "run a fable subagent to reason about everything you're unsure about including the undo test kata you cut".
- L1109 subagent report: instrumentation stack at transaction open shows
  `metabase.test.redefs/do-with-temp*-around-method <- metabase.test.data.users/user-request (users.clj:231) <- action-v2.test-util/create-rows!`
  with `rollback-only= true`. "Your kata sentence is wrong and would misdirect ... action-v2 is blameless."
- L1122-L1134 fix: insert Session + delete in `finally`; undo-test 134 assertions, 0 failures.
- L1144 commit `78f128f97e5` "Don't run a test request inside a rollback-only transaction". L1151-1155 kata issue
  rewritten, retitled, closed.

## Root cause
Two invisible facts combine: (1) the mock HTTP client runs the handler on the test's thread and connection, so it
shares the test's ambient transaction; (2) the non-keyword-user branch of `user-request` opened a with-temp
(rollback-only) scope around the request purely to create a throwaway Session. Nothing about
`(mt/user-http-request (mt/user->id :crowberto) :post 200 ...)` vs `(mt/user-http-request :crowberto ...)` suggests
different transactional behaviour.

## Why agents fall for it
The failure presents as "the feature's writes are missing" with 200 responses. The nested `t2/with-transaction` in
the feature code is the most visible transactional construct, so it gets blamed. The keyword/id distinction in the
caller is not something an agent would suspect.

## Current state
Fixed. `test/metabase/test/data/users.clj:226-245` (`user-request`) now inserts a `:core_session` row directly and
deletes it explicitly, with a comment at users.clj:238: "Do not use `with-temp` here. The request handler runs
in-process on this thread, so a rollback-only transaction around the Session would also discard every app DB write
made by the request." Documented in memory `reference_rollback_only_cache_pattern.md` (mechanism 2) and
`reference_mt_user_http_request_is_mock.md`.

## Suggested fix
Done. General lesson worth a lint/test: any test helper that wraps a caller-supplied body (especially an in-process
request) in `with-temp` imposes rollback semantics on the body. Prefer explicit insert/delete for helper-owned rows.

## Detection signal
- Agent attributes missing app-DB rows to feature code while the failing tests call `user-http-request` with a
  non-keyword user.
- Transcript pattern: issue filed/blamed on another team, then retracted after instrumentation -> high-value
  papercut flag.
- A harness test: call `user-http-request` with a user id against an endpoint that writes a row, assert the row is
  visible after the call.

## Raw excerpts
```
L1109 (subagent report)
**The mechanism.** `mt/user-http-request` calls the app handler **in-process on the calling thread** ... When the
user argument is an **id or user object rather than a keyword**, `user-request` wraps the *entire request* in
`t2.with-temp/with-temp [:model/Session ...]` (`test/metabase/test/data/users.clj:227-234`). On this branch that
with-temp is a genuine `{:rollback-only true}` transaction (`test/metabase/test/redefs.clj:43`), so **every app-db
write the request makes is discarded when the request returns**. The warehouse-table writes survive (separate
connection), the API returns 200, and the test's subsequent reads find nothing.
```
```
L1128 assistant: The report lands hard, and the headline is that **my kata issue was wrong about the mechanism** ...
My "needs someone who knows action-v2" dispatch was wrong, and the sentence I put in the issue would have sent
someone down the wrong path.
```
