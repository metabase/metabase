---
title: Toucan 2 runs before-update hooks before it opens its transaction, so do-after-commit in a before-update hook fires before the UPDATE; and t2/changes in after-update is a TransientRow whose contains? answers for every column
slug: toucan-before-update-hook-runs-outside-transaction
kind: codebase-trap
impact: both
severity: high
status: open
area: toucan2 1.0.519 tools/before_update.clj vs tools/before_delete.clj; src/metabase/app_db/connection.clj do-after-commit; src/metabase/osi/models/osi_ai_context.clj
occurrences:
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-pr-03-llm-config/93bd1b32-5bde-4582-9d8a-53740b3387ef.jsonl
    lines: 2970-3334
    date: 2026-08-30
    jev: {self_inflicted_bug: 0.94, tool_misuse: 0.52, misleading_signal: 0.56, user_correction: 0.54, codebase_trap: 0.91, flailing: 0.36, env_friction: 0.24}
---
## Summary
`:model/OsiAiContext` nudged the entity-retrieval index from a `define-before-update` hook through
`app-db/do-after-commit`, expecting the reconcile to run after the write committed. Toucan 2 runs
`before-update` hooks first and opens its own transaction afterwards. With no caller transaction,
`*after-commit-callbacks*` is nil, so `do-after-commit` ran the thunk at once, before the UPDATE. The async
reconcile read the old `ai_context`. roborev (codex) found it. The agent first moved the nudge to
`define-after-update` and hit a second trap: `t2/changes` inside `after-update` is a lazy
`toucan2.jdbc.row.TransientRow`. It prints as `{}`, but `contains?` answers from its column set, so the
"only nudge when `ai_context` changed" filter flipped and every metadata-only write nudged. `before-delete`
behaves the other way round: Toucan opens the transaction first and runs the hooks inside it.

## Symptom
- roborev job 5137 (L2973): "The before-update hook schedules reconciliation before an autocommit update executes. `do-after-commit` runs immediately outside a transaction, so the asynchronous reconcile can read the old `ai_context`".
- After the move to after-update (L3020): `FAIL in metabase.osi.ai-context.api-test/regenerate-does-not-nudge-test ... expected: [] actual: [["table" 1]]`.
- Debug print (L3025): `AFTER-UPDATE changes: ^toucan2.jdbc.row.TransientRow {} | meta: nil`.
- A regression test on the old code (L3250): `expected: {:synonyms ["after"]} actual: {:synonyms ["before"]}`.

## Timeline
- L2976-2981 agent checks `do-after-commit`: "`do-after-commit` outside a transaction runs the thunk **immediately**, but in a `before-update` hook the UPDATE hasn't executed yet."
- L2997-3001 tries to probe with a standalone `clojure -M:dev:ee:ee-dev:test -e (load-file ...)`. First attempt: macroexpansion NPE. Second: hangs on fixture init and times out after 10 min (exit 143).
- L3019-3020 moves the nudge to `define-after-update`. The regenerate test fails.
- L3024-3028 prints `t2/changes` in after-update: "a lazy `TransientRow` that prints empty but answers `contains?` from its **column set** ... Metadata doesn't survive between hooks either". Reverts.
- L3089 user: "could using a toucan middleware help?"
- L3105-3119 agent unzips the toucan2 jar from `~/.m2` and reads `toucan2/tools/before_update.clj`: `apply-before-update-to-matching-rows` runs, then `conn/with-transaction`.
- L3162-3204 user asks "why is the no-op cheap?". The agent had proposed dropping the filter and nudging on every write. It checks and finds that each targeted reconcile takes an exclusive `pg_advisory_lock`, during which library searches return empty. It also finds that the generation job's steady state is metadata-only `restamp!` writes. So the filter matters, and the first recommendation would have caused a regression.
- L3224 implements a `t2.pipeline/transduce-query` method on `[:toucan.query-type/update.* :model/OsiAiContext :default]` that binds the real changes map around `next-method`, and an after-update hook that reads the binding.
- L3313-3327 checks `before_delete.clj`: "transaction FIRST, then hooks", so the delete path is safe.
- L4407 writes memory `reference_toucan_hook_transaction_timing.md`.

## Root cause
Toucan's `before-update` and `before-delete` wrap the transaction at different points. Nothing in Metabase's
`do-after-commit` docstring says the "outside a transaction" branch can run *before* the write it belongs
to. The docstring claims the opposite: "Outside a transaction (autocommit), runs `thunk` immediately — the
surrounding write already committed." That holds for after-insert, after-update and before-delete. It is
false for before-update. `t2/changes` is documented for before-update, and nothing warns that it silently
changes meaning in after-update.

## Why agents fall for it
"Before-X hook + do-after-commit" reads as the standard way to defer work, and before-delete works exactly
that way. The docstring promise ("the surrounding write already committed") is the kind of sentence an
agent trusts without checking. `t2/changes` in after-update returns something that looks like an empty
map, so a naive REPL check (`(t2/changes row)` → `{}`) points the wrong way. Tests that run inside
`mt/with-temp`'s transaction defer the callback properly and hide the race. The api-test comment at L3016
says exactly this.

## Current state
- The trap still exists in the library, and the docstring is unchanged: `src/metabase/app_db/connection.clj:266-277` (`do-after-commit`: "Outside a transaction (autocommit), runs `thunk` immediately — the surrounding write already committed.").
- `src/metabase/osi/models/osi_ai_context.clj:76` on master uses `(t2/define-after-update :model/OsiAiContext [row] (nudge-entity-sync! row))` and nudges on every update, with no ai_context-only filter. That avoids the race but pays the per-write exclusive-lock cost the session measured. The pipeline-middleware version from this session is not on master.
- `grep -rln define-before-update src enterprise/backend/src | xargs grep -ln do-after-commit` → no hits today, so there is no live instance on master.
- Documented in memory `~/.claude/projects/-Users-christruter-workspace-metabase-metabase/memory/reference_toucan_hook_transaction_timing.md`, which was written in this session. It says "See `src/metabase/osi/models/osi_ai_context.clj` for the worked version", and that pointer is stale against master, which has the simpler after-update form.

## Suggested fix
- Amend the `do-after-commit` docstring: "Outside a transaction the thunk runs immediately. In a Toucan `before-update` hook that means *before* the UPDATE, because Toucan opens its transaction after running before-update hooks. Use after-update/after-insert/before-delete."
- Add a clj-kondo hook, or extend an existing one, that flags `do-after-commit` (or `request-*-sync!`) lexically inside `t2/define-before-update`.
- Add a Metabase helper, e.g. `models.interface/define-after-update-with-changes`, that owns the pipeline-binding trick, so nobody reads `t2/changes` in after-update.
- Fix the memory's pointer to the worked example, or inline the snippet.

## Detection signal
- Transcript: `define-before-update` and `do-after-commit` in the same edited form. Or an agent printing `t2/changes` in an after-update hook and seeing `TransientRow {}`.
- Static: kondo hook as above. Test-level: a model test that updates outside any transaction and asserts that the async side effect sees the new value (the session's `nudge-observes-the-committed-ai-context-test` is a template).

## Raw excerpts
```
L3116 (toucan2/tools/before_update.clj 94-112)
(m/defmethod pipeline/transduce-query [#_query-type     :toucan.query-type/update.*
                                       #_model          ::before-update
                                       #_resolved-query :default]
  ...
  (let [new-args-maps (apply-before-update-to-matching-rows ...)]
      (conn/with-transaction [_conn nil {:nested-transaction-rule :ignore}]
        (transduce ... next-method ...)))

L3324 (before_delete.clj 43-51)
  "Do a recursive SELECT query with the args passed to `delete!`; apply [[before-delete]] to all matching rows. Then call
  the `next-method`. This is all done inside of a transaction."

L3196 [ASSISTANT] A targeted reconcile takes `pg_advisory_lock(20012)` — exclusive. Searches take `pg_try_advisory_lock_shared`
on the same id, non-blocking, and return nil when it's held ... N dirty entities means N exclusive lock windows, each a
moment where searches return empty.
```
