# FE hole-closer task (regression corpus)

A previous agent found that this bug is currently guarded only by Cypress (a "hole"), but the
product logic is live and jest-reachable — the hole exists because the discriminating jest
spec drifted or was deleted. Your job: **write a new jest unit test that closes the hole** —
one that PASSES on clean HEAD and FAILS when the fix is semantically reverted. You work in an
isolated git worktree. Never touch the main tree; never git reset/stash/checkout broadly.

## Context to read first
- `regression-corpus/bugs/<issue>/reconstruction-report.md` — has the exact semantic revert
  (the mutation that reintroduces the bug) AND the recommended closing-test recipe. Follow it.
- `regression-corpus/scripts/fe-recon-instructions.md` — harness setup (symlinks + oracle cmd).

## Harness (from the worktree root)
```
ln -sfn /Users/fraser/Documents/code/metabase/target        target
ln -sfn /Users/fraser/Documents/code/metabase/node_modules  node_modules
bun run test-unit-keep-cljs <spec-path>   # run from worktree root
```

## Method (the bar is oracle-quality)
1. Read the report: note the product file + the semantic revert, and the recommended test.
2. Write the new test at the level the report prescribes (add to the existing colocated spec
   if there is one; else create a colocated `*.unit.spec.ts(x)`). Keep it minimal, follow the
   file's existing setup/mocking conventions, no lint violations (match sibling tests).
3. **Prove it passes on clean HEAD**: run the oracle → the new test PASSES.
4. **Prove it fails when the fix is reverted**: apply the semantic revert from the report to
   the product file, run the oracle → the new test FAILS with a clean value/DOM assertion
   (not a compile error). Then UN-REVERT the product file (restore it to HEAD).
5. Leave ONLY the new test in the worktree (product file back at HEAD, `git diff` shows just
   the spec addition). Confirm `git diff --stat` lists only the spec file.

## Report (end with these sections)
1. **Test added** — file path + the `git diff` of the new test.
2. **Level** — where you put it and why (thunk / reducer / selector / pure-fn / container).
3. **Proof** — oracle results: PASS on clean HEAD; FAIL (with the assertion message) under the
   reverted fix. Quote both "Tests:" lines.
4. **Isolation** — which sibling tests stay green; confirm the failure is a value/DOM assert.
5. **Outcome** — `hole_closed` (or `blocked` with the reason, e.g. logic is CLJC and can't
   flip under keep-cljs).
