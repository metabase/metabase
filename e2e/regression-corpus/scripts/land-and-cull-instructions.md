# Land-and-cull task (implementation, NOT study)

Turn a validated e2e-only finding into a landed change: add the witness as a **real unit test**
guarding the FIXED behavior, and **delete the redundant e2e repro**. The product code must end up
**unchanged and correct** — you are NOT reintroducing the bug on this branch.

You work in an isolated git worktree. Never touch the main tree; never git reset/checkout broadly;
**no `git stash`** (shared stack).

## Inputs (already in the repo on this branch)
- `regression-corpus/bugs/<issue>/witness.patch` — the unit test to land.
- `regression-corpus/bugs/<issue>/mutation.patch` — the bug reintroduction (used ONLY to verify the
  witness discriminates; must be reverted before you finish).
- `regression-corpus/bugs/<issue>/e2eonly-report.md` — context: the e2e spec, the repro title.

## Harness (from worktree root)
```
ln -sfn /Users/fraser/Documents/code/metabase/target        target
ln -sfn /Users/fraser/Documents/code/metabase/node_modules  node_modules
bun run test-unit-keep-cljs <spec>     # run from worktree root
```

## Steps
1. **Land the witness.** `git apply regression-corpus/bugs/<issue>/witness.patch`. If it doesn't
   apply cleanly (drift), re-create the test file from the code in `e2eonly-report.md`. The test
   must follow the file's conventions and pass lint.
2. **Verify it passes on clean HEAD**: run the oracle → the witness PASSES.
3. **Verify it's discriminating** (do this transiently): `git apply mutation.patch` → run oracle →
   the witness FAILS → **`git apply -R mutation.patch`** to restore correct product code. Confirm
   `git diff` shows the product file back to HEAD (no mutation left).
4. **Cull the e2e repro.** Open the e2e spec named in the report. Delete the block(s) whose title
   contains `metabase#<issue>` (or `describe("issue <issue>")`). Rules:
   - If other tests remain in the file, delete ONLY this issue's block(s), and clean up any now-
     unused imports/helpers/`describe` wrappers so the file still lints and runs.
   - If this was the file's only test, `git rm` the whole spec file.
   - Do not touch other issues' tests.
5. **Final state check.** `git status` should show: product code UNCHANGED, a new/edited unit spec
   (the witness), and the e2e spec edited or removed. Run the witness oracle once more → PASSES.

## Report (end with)
1. **Witness landed** — path + PASS-on-HEAD result.
2. **Discrimination proof** — FAIL-under-mutation result (then reverted).
3. **e2e culled** — spec path + the exact block title(s) removed (or "file removed").
4. **Final git diff --stat** — confirm product code untouched.
5. **Outcome** — `landed` or `blocked` (with reason, e.g. cull would break a shared helper).
