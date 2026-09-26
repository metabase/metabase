# FE semantic-reconstruction task (regression corpus)

You are reconstructing a historical frontend bug so we can test whether a **jest unit test**
catches it (a "kill") or whether only a Cypress e2e test does (a "hole"). You work in an
isolated git worktree. **Never touch the main working tree; never git reset/stash/checkout
broadly.**

## Goal
Reintroduce the BUG's behavior into the CURRENT (drifted) product code — NOT `git apply -R`
of the old fix (the code has moved/refactored). Then find the **surviving discriminating
jest spec** (the descendant of the fix's shipped spec — it may have been RELOCATED: `.js`→
`.ts`, `.jsx`→`.tsx`, `frontend/test/`→co-located, or module-extracted e.g.
`metabase-lib/…`→`metabase/…`, or a hook/component refactor). The oracle must **PASS on clean
HEAD and FAIL as a clean assertion** (a value/DOM mismatch, NOT a compile/import error) when
your mutation is applied.

## Harness setup (do this first, from the worktree root)
The worktree lacks compiled cljs + deps. Symlink them from the main tree:
```
ln -sfn /Users/fraser/Documents/code/metabase/target        target
ln -sfn /Users/fraser/Documents/code/metabase/node_modules  node_modules
```
Run the oracle **from the worktree root** (else it compiles pristine master → false negative):
```
bun run test-unit-keep-cljs <spec-path>
```

## Method
1. `git show <fix_commit>` — understand what the fix changed (product) and what regression
   test it shipped (the spec).
2. Locate where that product logic lives NOW (it has likely moved). Locate the surviving
   descendant of the shipped spec.
3. Establish baseline: run the oracle on clean HEAD → must PASS.
4. Apply a **minimal semantic revert** to the current product code that reintroduces the
   bug's behavior. Keep it surgical (don't break unrelated tests / imports).
5. Re-run the oracle → the discriminating test must FAIL with a value/DOM assertion.
6. Restore the product file if you like (we capture the diff from the report), but LEAVE the
   worktree so the orchestrator can capture `git diff`.

## Honest-negative is a valid outcome
If the fix's only regression protection is a **Cypress e2e** test and the shipped jest edits
were non-discriminating (mock rename, prop rename, callback-arity, `waitFor`, flake-fix with
zero behavioral assertion), and no surviving jest spec exercises the changed logic — then
report `reconstruction_failed`, category **cypress_only**. VERIFY this: try an aggressive
over-revert (fully neutralize the changed logic) and confirm it trips ZERO jest specs before
concluding. If the product code + spec were both DELETED by a later refactor with nothing to
revert, report `dead_target`.

## Report (end your run with exactly these sections)
1. **git diff** — the semantic revert (or "none" for a negative).
2. **Oracle** — exact spec path + command; **baseline** result; **reconstructed** result
   (Tests: N failed/passed).
3. **failure_shape** — the failing test name + the assertion mismatch (expected vs received).
4. **Confidence + adversarial** — why the failure isolates the reverted behavior (which
   sibling tests stay green), not a blunt break.
5. **Outcome** — `kill` (with oracle relocation noted), or `reconstruction_failed`
   (category: cypress_only | dead_target), and whether it's closable with a new unit test.
