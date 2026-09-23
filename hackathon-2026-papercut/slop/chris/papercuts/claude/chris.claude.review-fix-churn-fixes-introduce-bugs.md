---
title: Review-driven fix loops keep adding new defects, because each fix is checked only on the path the agent expected and its tests pass with the fix reverted
slug: review-fix-churn-fixes-introduce-bugs
kind: agent-behaviour
impact: both
severity: high
status: open
area: evals repo stats app-DB build (stats/sql.py, stats/build.py, tests/test_stats_sanitize.py); review loops that pair roborev with /code-review
occurrences:
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-evals/4ba68340-d63c-40cc-a449-6b56ac132245.jsonl
    lines: 1376-1724
    date: 2026-08-30
    jev: {self_inflicted_bug: 0.97, tool_misuse: 0.76, misleading_signal: 0.84, user_correction: 0.13, codebase_trap: 0.83, flailing: 0.59, env_friction: 0.55}
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-evals/4ba68340-d63c-40cc-a449-6b56ac132245.jsonl
    lines: 1685-1993
    date: 2026-08-30
    jev: {self_inflicted_bug: 0.94, tool_misuse: 0.79, misleading_signal: 0.63, user_correction: 0.91, codebase_trap: 0.81, flailing: 0.41, env_friction: 0.82}
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-evals/4ba68340-d63c-40cc-a449-6b56ac132245.jsonl
    lines: 1968-2302
    date: 2026-08-31
    jev: {self_inflicted_bug: 0.97, tool_misuse: 0.95, misleading_signal: 0.60, user_correction: 0.11, codebase_trap: 0.85, flailing: 0.65, env_friction: 0.85}
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-evals/4ba68340-d63c-40cc-a449-6b56ac132245.jsonl
    lines: 2270-2636
    date: 2026-08-31
    jev: {self_inflicted_bug: 0.89, tool_misuse: 0.72, misleading_signal: 0.95, user_correction: 0.47, codebase_trap: 0.84, flailing: 0.31, env_friction: 0.83}
---
## Summary
On evals PR #111 (branch `stats-dump-followups`) the agent ran five review rounds (roborev/codex plus a forked `/code-review high`). Every finding from round 2 onward was in code the agent had written to fix an earlier round's finding. The defects repeat a few shapes:
- A SQL guard that is wrong on the empty set.
- A "convergence wait" that returns on its first poll.
- An oracle value taken from whatever was in scope.
- Rationale comments that assert mechanisms nobody checked.
- Tests that stay green with the fix reverted.

The user stepped in at L1852: "it sounds mostly like you've been too careless in your fixes. is there a way to fix things in a more measured and careful way?" What finally worked was a mutation sweep: revert each guard and confirm that some test fails. Two guards had no test at all.

Environmental contributors (why this is more than one slip):
1. **Test doubles with the wrong type.** The real `_scalar_query` returns `str`. The doubles returned `int`, so dropping an `int()` conversion left the suite green (reviewer finding, fixed in 7b68114).
2. **Stub-heavy tests of `_settle_semantic_index`.** Monkeypatching `_boot_metabase`, `_wait_for_general_search` and `_scalar_query` let tests pass when the guard was moved above the boot, or deleted. The code under test had no seam that would show ordering.
3. **Postgres `NOT IN (subquery)` semantics.** Over an empty subquery it is true for every row, and over a NULL it matches nothing. "Retired = not active" quietly became "drop everything".
4. **Two review agents that disagree.** Round 3's internal reviewer said to drop the `--from index` recovery advice. Round 4's roborev said to restore it. The agent flip-flopped once before reading the code to settle it.

## Symptom
- Round 2 (L1387-1391): reviewer: "`drop_retired_general_search_state()` becomes a full wipe when no row is active". Reproduced against Postgres: `tables before: 2 / tables after: 0 / metadata rows: 0`.
- Round 3 (L1533): the guard counted rows, not distinct index names. The settle check compared names, not contents. The ORDER BY rationale comment was invented.
- Round 4 (L1761): "The oracle is `semantic_estimated`, but nothing ever proved that number against the table `general_search_table` names". Also: "The real `_scalar_query` returns str; an int double hides every int()".
- Round 5 (L2161): "The new 'convergence window' returns on its first poll, so it grants no settling time ... A transient overshoot during re-ingestion now aborts the whole build." The agent had to TaskStop a multi-hour build that was already running (L2175-2192).
- L1867 mutation sweep: `index-stage population assert (7b68114) *** SURVIVED ***`. The generated-setting-pin mutation also survived, because the generated text was byte-identical to the hardcoded text.

## Timeline
- L1390-1391: agent reproduces the wipe in a throwaway `postgres:16` container.
- L1402: rewrites the guard: `IF active_indexes <> 1 THEN RAISE EXCEPTION 'general search has % active indexes, so which are retired is undefined'`. Moves the DELETE into the DO block and uses `IS DISTINCT FROM 'active'`.
- L1472 ASSISTANT: "That's a fix of mine that was worse than the problem it solved."
- L1609-1640: a mutation check aimed at the ordering "passes", but the mutation had landed in the wrong function (see python-heredoc-str-replace-edits-misfire). L1614: "The block landed in the wrong function (an earlier identical anchor line)." L1630: "I confused myself — my `sed` range stopped before the check, so I was reading a truncated view."
- L1850 ASSISTANT: "Nothing in rounds two, three or four was a defect in the original PR. Every finding since round one has been in code *I* wrote while fixing review findings."
- L1852 USER: "medium still sounds worth fixing. it sounds mostly like you've been too careless in your fixes."
- L1857 ASSISTANT names the four failure modes: "I verified the path I expected, not the ones I didn't ... I wrote confident rationale comments for mechanisms I hadn't checked ... I reached for the nearest value rather than the right one ... My tests asserted the code ran, not that it would catch the regression."
- L1858-1900: mutation sweep script over 14 guards (`if False:` substitutions), iterated to "survivors: 0".
- L2001-2014: SQL edge-case sweep in a container: two active same table, two active different tables, one active one retired, no active, NULL index_name.
- L2069 USER: "run another review round in the background - just for interests sake". That round found the first-poll no-op in `_wait_for_general_search` (L2170-2175). The agent stopped the build, deleted the wait, and restarted it (c41bb54).
- L2313 ASSISTANT: "this is the fifth consecutive round where a fix of mine contained a defect, and this time only an unprompted extra review caught it."

## Root cause
The agent's fixes were aimed at the reviewer's sentence, not at the invariant behind it. Verification ran the happy path only. Nothing in the harness pushed back:
- The tests stub at function granularity, so ordering and type bugs don't show.
- The evals repo has no mutation-testing tool or guidance.
- A second review round finds new issues in the new code, which reads like progress.

## Why agents fall for it
- Each round a reviewer returns N findings; fixing them all and pushing feels like converging.
- Green CI after each round (L1480, L1670) is taken as evidence. But CI only runs the same stubbed tests.
- Reusing a value already in scope (`semantic_estimated`) and writing a plausible "why" comment are low-effort defaults.
- Reviewer disagreement (round 3 vs 4) looks like ambiguity rather than a sign to go read the code.

## Current state
- The fixes landed on evals `stats-dump-followups`. Current evals checkout (b9ed9e7) has the guard at /Users/christruter/workspace/metabase/evals/stats/sql.py:344-345 (`SELECT count(DISTINCT index_name) INTO active_indexes ... IF active_indexes <> 1 THEN`).
- No memory entry or CLAUDE.md rule covers "mutation-check your own review fixes" or "SQL NOT IN empty/NULL". Closest: `feedback_own_prs_fix_dont_review.md` ("iterate until roborev converges"), which pushes toward exactly this loop without a quality gate. `project_mutation_testing` exists only as a Metabase skill (`mutation-testing`), and it targets whole namespaces, not "did my fix get tested".

## Suggested fix
- Add to the user's memory or the evals CLAUDE.md: "For every guard you add while fixing a review finding, revert it and confirm a test fails before committing. Enumerate SQL edge cases (empty set, NULL, duplicates, many) and run them against real Postgres."
- Change `feedback_own_prs_fix_dont_review` so that "converge" means a clean mutation check plus a clean review, not only a clean roborev.
- In the evals tests, make scalar doubles return `str` like the real `_scalar_query`, and give `_settle_semantic_index` an event-order seam so ordering is asserted rather than stubbed away.
- Lint for `NOT IN (SELECT` in the evals SQL builders; prefer `NOT EXISTS`.

## Detection signal
- Same PR, same session: 3 or more commits whose messages are corrections ("Refuse...", "Measure ... not just", "Drop a ... that established nothing") after review notifications.
- The assistant saying "a fix of mine", "worse than the problem", "my earlier check was bogus".
- A review round whose findings all point at lines added in the previous round (`git blame` on the finding locations resolves to the session's own commits).
- TaskStop of a long build shortly after a review notification.
- A hook could suggest a mutation check when a commit touches both a guard (`raise`/`RAISE EXCEPTION`/`SystemExit`) and a test file.

## Raw excerpts
```
L1391 [RESULT] tables before: 2
tables after:  0
metadata rows: 0
```
```
L1447 [RESULT] ### 1. no active row (the wipe scenario)
ERROR:  general search has 0 active indexes, so which are retired is undefined
   tables surviving: 2  <- was 0 before the guard
```
```
L1850 | Round | Worst finding | What it would have done |
| 2 (my fixes) | medium | My drop wiped every index table when none was active — destroyed hours of work |
| 3 (my fixes) | medium | Gate compared the index's name, not its contents — depleted index published |
| 4 (my fixes) | medium | Oracle never proved against the table it names; no convergence window |
```
```
L1867 [RESULT] guard                                          verdict
active-index guard (dee1c02)                   caught
...
index-stage population assert (7b68114)        *** SURVIVED ***
```
```
L2161 **stats/build.py:1479 — medium. The new "convergence window" returns on its first poll, so it grants no settling time.** `_wait_for_general_search` polls immediately (no initial sleep) and returns as soon as `population == expected`. In the drain path that is the *starting* state
```

## Additional occurrence (Metabase app-db transactions)
- transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-fix-app-db-rollback-only/31b066ea-d480-4a3f-a6f1-0bc74a18367f.jsonl
  lines: 861-1000
  date: 2026-08-25
  jev: {self_inflicted_bug: 0.98, tool_misuse: 0.64, misleading_signal: 0.63, user_correction: 0.42, codebase_trap: 0.87, flailing: 0.63, env_friction: 0.70}

During a /pr-review of PR #80065, the user asked the agent to fix some findings. One fix answered a CI deadlock: `savepoint-gone?` stopped setting `*rollback-required*` when MySQL's savepoint had vanished (error 1305). It was checked only on the path the agent expected ("the server has already discarded the writes").
Roborev on the new commit (job 4873, High): "A missing savepoint does not prove that no writes remain pending. After MySQL implicitly commits and removes the savepoint, later statements can start a new transaction; suppressing `*rollback-required*` lets an enclosing scope catch the rollback error and commit those writes."
L976 (agent): "my `savepoint-gone?` change is a regression, and I should revert it ... Worse, it didn't buy anything. In the CI failure I was reasoning from, the exception propagated uncaught all the way out of the test — the flag never came into play." A second fix in the same batch (search test-util gating, roborev 4875) was also incomplete. Two more findings asked for missing regression tests.
The environmental factor: MySQL/H2 implicit-commit semantics (see `search-temp-index-ddl-commits-enclosing-with-temp`) make "savepoint gone" look like "nothing pending". The agent could not run MySQL locally before pushing.

## Additional occurrence
- transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-stats-remote-sync/6fdcc6ed-191e-460e-8ffe-523a794c6ac7.jsonl
  lines: 1043-1217
  date: 2026-09-02
  jev: {self_inflicted_bug: 0.95, tool_misuse: 0.82, misleading_signal: 0.66, user_correction: 0.38, codebase_trap: 0.86, flailing: 0.33, env_friction: 0.84}

On metabase/evals#113 (the fixture runbook), three roborev rounds in a row flagged the agent's own previous fix:
- L1054 (5483, Medium): the agent swapped the runbook's bare `CREATE TABLE` for data-stack's `CREATE TABLE IF NOT EXISTS` DDL. That removed a deliberate safety property (bare CREATE *fails* on a stale local schema, and the README said so), so the runbook would silently validate the wrong definitions.
- L1126-1131 (5484, two Medium): the fix drops and recreates the `evals` database, but the loader's lock `evals._fixture_loader_lock` lives *inside* that database. Recreating it destroys a live loader's lock and staging tables, and the branch's recent commits ("Serialize fixture publication", "Make fixture lock recoverable") show the lock was built on purpose.
- L1166 (5485): a TOCTOU race between the agent's new lock check and `DROP DATABASE`.
L1200: the user stopped it: "this stuff just has to be good-enough - the dlt will only run hourly etc, not a big chance of races". L1189: "I've stopped editing #113." Same pattern as above: each fix was checked only against the finding it answered.
