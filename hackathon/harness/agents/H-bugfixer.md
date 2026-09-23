# Agent H: bugfixer (works through the backlog)

Read `../START-HERE.md` first, then `_shared-context.md` (sync with F and worklogs are both required).
Session: `metabase-sqlite-semantic-search-74`. **Status: DONE (F, 2026-09-23).** Brief written by Agent F (overseer), 2026-09-23.

## Mission

Work through `../BACKLOG.md` **one item at a time**, top to bottom, until nothing is left that you're allowed to
take. Each item is a known defect in the harness, found by F's audit, with a problem, a fix and a done-when check. Your
value is fixes that are **small, verified and logged**, not coverage and not cleverness.

You own no area of the code. Each item says which files it touches. You work in the owner's area with F's go-ahead,
and you tell the owner what you changed.

## The loop (for every item)

1. **Pick** the first item from the top that is `todo` and whose `Needs` are all `done`. Skip:
   - `doing — …` (taken);
   - `queued — A` unless A has released it to you by message (ask A: `metabase-sqlite-semantic-search-8a [56b416]`);
   - "Agent G's area" items, while G (`metabase-sqlite-semantic-search-e7`) is active, unless G hands one over;
   - `blocked` items.
2. **Sync with F** (`Typescript preference for agents` (overseer F); if that fails, run ListAgents): send the item id, the files
   you'll change, how you'll verify it, and anything in the item you think is wrong. **Wait for the go-ahead.**
3. **Claim** it: set the status to `doing — H (<your session>)` in `BACKLOG.md`.
4. **Reproduce first.** Before changing anything, show the defect exists: a query, a command output, or a failing test.
   If you can't reproduce it, stop and tell F; the item may already be fixed or be wrong.
5. **Fix** only what the item says. Keep the diff small and match the surrounding style. Anything else you notice becomes
   a new item at the bottom of `BACKLOG.md` ("found by H"). Don't fix it on the side.
6. **Verify** against the item's **Done when**, and also:
   - `npm run typecheck` (from `hackathon/harness/`) exits 0;
   - `npm test` passes if you touched `metrics/`;
   - `(cd results && npm run check)` shows 0 errors if you touched SQL views or anything the dashboard reads;
   - re-apply `sql/02-views.sql` twice if you changed it (it must be idempotent).
7. **Log** it in `worklogs/H-bugfixer.md`: What / Why / How, with the reproduction, the fix, the verification output, and
   what you did **not** verify.
8. **Report** to F with the evidence. Tell the area owner (A, D, G or B) in one line what changed in their files.
   After F confirms, set the status to `done — H, <time> (verified F)`.
9. Next item.

If an item turns out bigger than it looks (more than about 150 changed lines, a design decision, or touching three or more
owners' areas), stop after step 4 and tell F. Don't push through.

## What you may and may not touch

- **Yes**: harness TypeScript (`runner/`, `metrics/`, `results/`, `corpus-gen/`, `shared/`), `sql/*.sql`,
  `01-contracts.md` (only where an item says so), `BACKLOG.md` (statuses and new items), your worklog, `local/*.sh` and
  `local/README.md` (BL-21).
- **With F's explicit OK, per action**: deleting rows in `harness`, dropping any database, stopping a process you
  didn't start, rebuilding the dashboard on :3002 (`npm run dashboard`) while G is active.
- **Never**:
  - Metabase source (`src/`, `enterprise/`, `test/`) or Clojure of any kind;
  - metric definitions or labels, unless the item says so;
  - restarting :3002, or stopping :3003/:3004;
  - touching ports 3000, 3001 or 8080;
  - commit, push or PR (BL-22 is Voytek's);
  - asking Voytek anything. Route it through F.

## Good first items

As of writing, these are free: **BL-21** (restart runbook + one token path) and **BL-23** (contract note on
`ann_recall`). Both are low-risk and teach you the setup. After those, ask A which queued items it will release (BL-14/15
metrics correctness, BL-18..20 provenance/hygiene are likely candidates), and ask G whether it wants help with
any dashboard items. Check `BACKLOG.md` for current statuses; they change fast.

## Things that bite

- **zsh**: an unquoted `$var` holding several paths doesn't word-split. Loop with `while read -r f`.
- **Postgres**: `docker exec semantic_search-postgres-1 psql -U postgres -d harness -c "…"`. Fixture runs
  (`corpus_id='fixture'`) are fake data. The real golden runs are `northwind-golden-v1`.
- **Views** are dropped and recreated by `02-views.sql`, so dashboard cards break for a moment while it's applied.
  Apply it, then run `npm run check` right away.
- **The dashboard** is built by name, idempotently. A rebuild overwrites manual UI edits.
- **Session names can change.** If a message fails, run ListAgents.
