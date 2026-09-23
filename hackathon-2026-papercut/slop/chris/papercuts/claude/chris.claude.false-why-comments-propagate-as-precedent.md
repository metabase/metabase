---
title: Pre-existing "why with-redefs" comments name thread mechanisms that don't exist, and agents copy them as evidence
slug: false-why-comments-propagate-as-precedent
kind: codebase-trap
impact: both
severity: medium
status: open
area: test/metabase/transforms/jobs_test.clj (and any :metabase/prefer-with-dynamic-fn-redefs suppression comment)
occurrences:
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-fix-with-dynamic-in-ci/a42e9e59-56fc-4f44-8f9e-833d9d1dba2c/subagents/agent-ad334f260d4e69004.jsonl
    lines: 473-607
    date: 2026-09-11
    jev: {self_inflicted_bug: 0.64, tool_misuse: 0.22, misleading_signal: 0.66, user_correction: 0.85, codebase_trap: 0.89, flailing: 0.46, env_friction: 0.57}
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-fix-with-dynamic-in-ci/a42e9e59-56fc-4f44-8f9e-833d9d1dba2c.jsonl
    lines: 629-760
    date: 2026-09-11
    jev: {self_inflicted_bug: 0.78, tool_misuse: 0.59, misleading_signal: 0.82, user_correction: 0.14, codebase_trap: 0.93, flailing: 0.62, env_friction: 0.75}
---
## Summary
A suppression of `:metabase/prefer-with-dynamic-fn-redefs` is a claim about which thread runs the redefined fn, and nothing checks it. Existing comments on master make false claims: `jobs_test.clj` says transforms run on an "ExecutorService worker (transforms-sql-worker)", but no such executor exists; `submit-transform!` dispatches with `future`, which conveys bindings. A `field_test.clj` comment claimed `mt/user-http-request` is real HTTP on a Jetty thread (also false). Agents treated these comments as precedent: batch D wrote new suppressions restating the `transforms-sql-worker` claim, and three agents reused the Jetty claim for 22 sites.

## Symptom
Coordinator challenged batch D's new comments; D admitted: "my two comments restated the `transforms-sql-worker` claim from the pre-existing HEAD comment at jobs_test.clj:593-596, which I read at the start and never verified."

## Timeline
- Subagent D L526: "You're right, and it's the same inheritance: my two comments restated the `transforms-sql-worker` claim from the pre-existing HEAD comment ... which I read at the start and never verified."
- Subagent D L538: "`transforms-sql-worker` appears nowhere in `src/`, `enterprise/` or `modules/` — only in that file's own comments; `submit-transform!` (jobs.clj:178) dispatches via `(future ...)` with `run-transform!` called inside it, and `future` conveys bindings; the sole transforms executor is `newScheduledThreadPool 1` in canceling.clj for cancellation timeouts. So the stated mechanism doesn't exist".
- Subagent D L572: converted tests pass non-vacuously (CyclicBarrier would time out if the redef were invisible).
- Subagent D L604: "only the HEAD ignore remains in `jobs_test`" -- the original false comment was left in place.
- Memory reference_mt_user_http_request_is_mock.md: "a comment at `field_test.clj:891` claims `mt/user-http-request` issues a real HTTP request handled on a Jetty worker thread. It is wrong, and it spread."

## Root cause
Why-comments for suppressions are free text; the kondo ratchet requires a comment to exist but can't verify its content. Once one wrong comment is on master it looks authoritative, and agents doing bulk conversion use nearby comments as cheap evidence instead of tracing the dispatch.

## Why agents fall for it
Tracing thread hops is expensive (several files deep); a confident comment one screen away is cheap and looks like reviewed team knowledge. With 300+ sites, agents batch-reason.

## Current state
Still exists on master: `test/metabase/transforms/jobs_test.clj:593-599`:
```
;; with-redefs, not with-dynamic-fn-redefs: run-transforms! dispatches each transform on an
;; ExecutorService worker (transforms-sql-worker), which doesn't convey dynamic bindings, so a
;; proxy-based redef is invisible there and the barrier choreography silently no-ops. A global
;; root swap is seen by every thread.
;; [kondo-keep] suppresses a warning :redundant-ignore can't see; --audit rechecks
#_{:clj-kondo/ignore [:metabase/prefer-with-dynamic-fn-redefs]}
```
`grep -rn transforms-sql-worker src enterprise modules` finds nothing; `src/metabase/transforms/jobs.clj:172-178` says "Run `transform` on its own thread; returns a future" and uses `(future ...)`. (It is possible the barrier test at this site has another reason to need a root swap, but the stated reason is false.) The field_test Jetty comment was removed in #82388. Memory documents the general lesson ("Trace the call to the client var before believing a 'runs on a Jetty thread' comment, including a pre-existing one").

## Suggested fix
- Fix or delete the jobs_test.clj:594 comment and retry the conversion there.
- Require suppression comments for this linter to name a concrete mechanism from a closed list (Quartz job, raw Thread, c3p0 callback, real HTTP via `client-real-response`/`user-real-request`, executor without `bound-fn`, reify/primitive proxy limit) and add a checker that the named thing appears in the form or in src.
- Add to the `with-dynamic-fn-redefs` docstring: "`future`, `bound-fn`, `streaming-response` convey; verify before copying a neighbour's comment."

## Detection signal
- Transcript: agent writes a suppression comment containing an identifier (like `transforms-sql-worker`) that it never grepped in `src/`.
- Repo lint: identifiers in backticks/parens inside suppression comments that don't resolve to any symbol in src.

## Raw excerpts
```
(subagent D) L526 [ASSISTANT] You're right, and it's the same inheritance: my two comments restated the `transforms-sql-worker` claim from the pre-existing HEAD comment at jobs_test.clj:593-596, which I read at the start and never verified. Let me confirm the dispatch mechanism myself and get the current file state.
(subagent D) L538 [ASSISTANT] Evidence confirmed on all three points: `transforms-sql-worker` appears nowhere in `src/`, `enterprise/` or `modules/` — only in that file's own comments; `submit-transform!` (jobs.clj:178) dispatches via `(future ...)` with `run-transform!` called inside it, and `future` conveys bindings; the sole transforms executor is `newScheduledThreadPool 1` in canceling.clj for cancellation timeouts. So the stated mechanism doesn't exist, and I propagated it from the HEAD comment without observing it.
```
