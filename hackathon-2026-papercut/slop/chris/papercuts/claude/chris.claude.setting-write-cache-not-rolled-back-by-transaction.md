---
title: A defsetting write inside t2/with-transaction updates the in-memory settings cache immediately, so a rollback leaves the node serving a value the DB no longer has
slug: setting-write-cache-not-rolled-back-by-transaction
kind: codebase-trap
impact: both
severity: medium
status: open
area: src/metabase/settings/models/setting.clj (set-value-of-type! :string, set-many!), settings cache; enterprise metabot permissions mode switch
occurrences:
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-80394-metabot-tennant/f6535e97-e0e1-4040-958e-3a5295bd2b0f.jsonl (deleted; reconstructed from redacted chunks)
    lines: 42-181, 345-548
    date: 2026-08-21
    jev: {self_inflicted_bug: 0.97, tool_misuse: 0.93, misleading_signal: 0.41, user_correction: 0.87, codebase_trap: 0.83, flailing: 0.36, env_friction: 0.76}
---
## Summary
In PR #80468, both `/api/ee/ai-controls/permissions/advanced` endpoints delete `metabot_permissions` rows and write the `metabot-advanced-permissions` setting. CodeRabbit said the pair is not atomic and suggested `t2/with-transaction`. The agent knew about the cache in general terms ("the settings setter calls `restore-cache!`/`update-cache!`, so a rollback would leave the in-memory cache disagreeing with the DB", L181). So it chose to **reorder** the two writes instead. That was the wrong fix. It took three roborev rounds and four commits to converge:
1. `4d70bc4` "Flip the metabot permission mode before dropping the group-level rows". Roborev 4803/4805: a failed delete now leaves the mode switched. "Ordering the two writes only chose which half-applied switch an admin got."
2. `b799b95` "Switch the metabot permission mode in one transaction", with the setting write last. Roborev 4809: "The setting setter updates the in-memory cache before the transaction commits. If a later audit hook, cache-timestamp operation, or commit fails, the database rolls back but t[he cache keeps the new value]".
3. `bb07da4` added `(catch Throwable e (setting/restore-cache!) (throw e))`. Roborev 4811: the atomicity test stubs the setter with a throwing fn, so the cache path is never exercised.
4. `1e8f5df` the test now calls the real setter before throwing. A mutation check (remove the catch, L522-527) confirmed that the test fails without the restore.

## Symptom
Review findings that went round in circles on one two-line function. From the user's side: 4 extra commits, pushes, and PR-body edits.

## Timeline
- L58: CodeRabbit (Major): "Wrap the mode switch in one transaction. If the setting write fails, the permission-row deletion can commit while advanced mode remains enabled."
- L77-78: the agent greps `with-transaction` in `src/metabase/settings/` and reads `set-value-of-type!`.
- L109: reorders instead: ";; Flip the mode before deleting: a failed delete then only leaves rows simple mode ignores ...".
- L181: explains why it skipped the transaction: "the rollback-only cache trap".
- L349 roborev 4803: "If the delete fails, the endpoint returns an error but leaves simple mode enabled."
- L359: "Roborev's new review (4803) pushes back on my ordering — and it has a point".
- L364: `switch-mode!` in `t2/with-transaction`, setting last. Docstring: "The setting write goes last, since it updates the settings cache in place and a rollback would not undo that." That rationale is wrong: the commit itself can still fail after the cache is updated.
- L405-417: mutation check. Replacing the transaction with `do` makes `mode-switch-is-atomic-test` fail. Good.
- L474 roborev 4809: the cache can be left stale.
- L478: adds `catch Throwable ... (setting/restore-cache!)`.
- L499 roborev 4811: the test replaces the setter, so the cache path is not covered.
- L515-527: the test now writes the setting for real, then throws. The mutation (remove the catch) fails: `expected: (true? (metabot-settings/metabot-advanced-permissions)) actual: (not (true? false))`.

## Root cause
`set-value-of-type! :string` (src/metabase/settings/models/setting.clj:856-910) calls `setting.cache/restore-cache!`, writes the DB row, then calls `setting.cache/update-cache! setting-name new-value` (line 905) and `update-settings-last-updated!`. The cache is an atom and does not take part in the JDBC transaction. The only place that handles this is `set-many!` (lines 1512-1530): `(try (t2/with-transaction ...) (catch Throwable e (setting.cache/restore-cache!) (throw e)))`. Any other caller that wraps `(some-setting! v)` in its own transaction has to find and copy that pattern. The `set!` docstring (line ~1080) says "by default, this just updates the Settings cache and writes its value to the DB" and says nothing about transactions.

## Why agents fall for it
- `t2/with-transaction` looks like it makes everything inside atomic.
- The cache side effect sits three calls deep, in the setter's `set-value-of-type!` method.
- The precedent `set-many!` is not referenced from `set!` or from `defsetting` docs.
- Stubbing the setter in tests hides the problem, because the stub never touches the cache.

## Current state
Still open in the setter. The metabot endpoint was fixed and merged: `enterprise/backend/src/metabase_enterprise/metabot/api/permissions.clj:88-100` (`switch-mode!` with `restore-cache!` in its catch). `setting.clj:905` still updates the cache eagerly. Only `set-many!` (1512-1530) guards it. Memory `reference_rollback_only_cache_pattern.md` covers caches that outlive rollback-only test transactions, but not the settings cache under production transactions. No CLAUDE.md or skill mentions it.

## Suggested fix
- In `set-value-of-type!`, when `(mdb/in-transaction?)`, defer `update-cache!` / `update-settings-last-updated!` to after-commit, and register a rollback hook that calls `restore-cache!`. Or expose a `with-settings-transaction` macro that wraps `set-many!`'s try/catch.
- At minimum, add a line to the `set!` docstring: "Inside a caller's transaction, the cache update is not rolled back; wrap in try/catch + `restore-cache!` like `set-many!`."

## Detection signal
- Lint: a `defsetting` setter call (`<name>!`) or `setting/set!` lexically inside `t2/with-transaction` with no `restore-cache!` in an enclosing catch.
- Transcript: reviewer text "settings cache" + "rollback", or an agent reordering writes to avoid a transaction.

## Raw excerpts
```
L181 [ASSISTANT] ... CodeRabbit suggested `t2/with-transaction`, but I didn't do that — the settings setter calls `restore-cache!`/`update-cache!`, so a rollback would leave the in-memory cache disagreeing with the DB (the rollback-only cache trap). Reordering fixes it for free instead ...
L457 roborev 4805: Both endpoints persist the new mode before deleting permission rows. If deletion fails, the request returns an error while the mode remains switched ...
L474 roborev 4809: The setting setter updates the in-memory cache before the transaction commits. If a later audit hook, cache-timestamp operation, or commit fails, the database rolls back but t…
L494 commit: "Reload the settings cache when a mode switch rolls back" -m "The setting write updates the cache in memory, which the rollback does not undo, so a commit failure would leave this node serving a mode the database does not have."
L527 [RESULT] the cached mode goes back to the one the database still holds
expected: (true? (metabot-settings/metabot-advanced-permissions))
  actual: (not (true? false))
```
