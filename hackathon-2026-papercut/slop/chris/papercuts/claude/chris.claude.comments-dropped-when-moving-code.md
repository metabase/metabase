---
title: Refactors that move code between namespaces condense or drop the "why" comments that went with it (c3p0 deadlock note, driver-implementation caveats)
slug: comments-dropped-when-moving-code
kind: agent-behaviour
impact: introduced-bug
severity: medium
status: unknown
area: cross-namespace moves in metabase src (PR #82011 break-requiring-resolve-cycles: analytics/prometheus.clj, driver/sql_jdbc/connection/pool_lock.clj, query_processor/util/persisted_cache.clj, pulse/task/send_pulses_trigger.clj, parameters/params.clj)
occurrences:
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-worktree-break-requiring-resolve-cycles/44d740f8-47f4-42f8-b6af-2964dbacf800.jsonl
    lines: 796-921
    date: 2026-09-11
    jev: {self_inflicted_bug: 0.96, tool_misuse: 0.29, misleading_signal: 0.65, user_correction: 0.93, codebase_trap: 0.68, flailing: 0.36, env_friction: 0.83}
---
## Summary
PR #82011 replaced `requiring-resolve` calls with real requires by moving code into new namespaces. The PR was handed from Ben Grabow to Chris; its 29 commits were squashed, and a placement commit was added by the agent. The user noticed that a six-line comment explaining a c3p0 JMX/pool-creation deadlock had become a one-liner plus a paraphrased docstring. The paraphrase dropped "non-obvious but absolutely required", the specific lock objects, and "Hopefully." The agent's diff scan found four more lost comments. The trap: a "mechanical" refactor feels safe to paraphrase, and nothing in review tooling flags deleted comments that don't reappear.

## Symptom
- L796 USER: "we seem to have lost some big comments like this: ;; Using this `locking` is non-obvious but absolutely required to avoid the deadlock inside c3p0 implementation ... Hopefully. am i wrong, has it just moved? also are there any other comments we've lost? let's not lose valuable context on our code"
- L802: `git grep DynamicPooledDataSourceManagerMBean` -> HEAD has only `pool_lock.clj:5` (docstring paraphrase). The merge-base had it at `analytics/prometheus.clj:141,144`.
- L820 lost-text scan: removed `;;` lines with no matching added line, across serialization.clj, warehouses/models/database.clj, permissions graph, scoring.clj, etc.
- L849: sorted into "obsolete with the requiring-resolve", "moved or updated", and "lost and worth restoring" (5 items).

## Timeline
- L800: agent plans a two-pass scan (`;;` comments, then prose-looking docstring lines).
- L803: writes `lost_text.clj` (bb). Usage: `git diff -U0 BASE HEAD | bb lost_text.clj`.
- L833-836: `hunks.clj` shows the relevant diff hunks per file/regex.
- L868-887: restores via perl script (after an Edit-hook concern), including `;; We should not be using specific driver implementations` on requires in prometheus.clj and persisted_cache.clj.
- L894: commit ff47a99cdc2 "Restore comments lost when code moved". L896: memory `feedback_keep_comments_when_moving_code.md` written.
- L915-916: pushed.

## Root cause
Moving code between namespaces with an LLM rewrite (rather than a literal cut/paste) invites summarising. Comments attached to a call site (`locking` in prometheus.clj) have no obvious new home when the lock object moves to another namespace, so they get folded into the new namespace's docstring. `requiring-resolve` caveat comments ("we should not be using specific driver implementations") look obsolete once the requiring-resolve is gone, even though they describe the dependency, not the mechanism.

## Why agents fall for it
- Docstrings and comments look like prose to tidy, not like code to preserve.
- Commits split per unit of refactoring make each drop look small.
- `git diff` shows the deletion and the paraphrase in different files, so side-by-side review doesn't catch it.

## Current state
- Memory `feedback_keep_comments_when_moving_code.md` now exists (written in this session, 2026-09-11) and is indexed in MEMORY.md: "move 'why' comments verbatim; diff-scan for dropped `;;`/docstring text before pushing".
- The scan scripts lived only in the session scratchpad. No repo or `~/bin` tool exists for "lost comment" detection.
- The restored comment is in the current checkout: `src/metabase/analytics/prometheus.clj` around the c3p0 `locking` call, next to `pool-lock/monitor`.

## Suggested fix
- Move `lost_text.clj` into `~/bin` (or `./bin/mage lost-comments BASE`) and mention it in the memory entry, so the check is one command.
- A review-bot rule: flag `;;` comment blocks of 3+ lines deleted with no ≥60%-similar block added anywhere in the diff.

## Detection signal
- User messages like "lost some comments", "has it just moved?".
- In a diff: a multi-line `;;` block removed, and a new namespace docstring mentioning the same rare tokens (`DynamicPooledDataSourceManagerMBean`).

## Raw excerpts
```
L802 [RESULT] HEAD:
HEAD:src/metabase/driver/sql_jdbc/connection/pool_lock.clj:5:  DynamicPooledDataSourceManagerMBean and then a PoolBackedDataSource, while
master (merge-base):
90e121c...:src/metabase/analytics/prometheus.clj:141:    ;; act of JMX attribute reading first locks a DynamicPooledDataSourceManagerMBean object, and then a
90e121c...:src/metabase/analytics/prometheus.clj:144:    ;; DynamicPooledDataSourceManagerMBean. We have to lock a common monitor (which `pool-cache-key->connection-pool` is)
```
```
L910 **The c3p0 comment** didn't move intact. The lock itself moved into a new namespace, `pool_lock.clj`, and its docstring kept a paraphrase ... At the `locking` call in `prometheus.clj`, the six-line comment had been cut to one line. That dropped "non-obvious but absolutely required", the specific lock objects, and the author's "Hopefully."
```
