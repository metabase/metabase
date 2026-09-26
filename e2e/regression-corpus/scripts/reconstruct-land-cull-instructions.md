# Reconstruct → witness → land → cull (full loop, IMPLEMENTATION)

Given a fresh e2e-only bug (fix + Cypress repro shipped together, no unit test), produce a landed
change: add a **real unit test** guarding the fixed behavior and **delete the redundant e2e repro**.
The product code must end up **unchanged and correct** — you are NOT leaving the bug reintroduced.

Isolated git worktree. Never touch the main tree; never git reset/checkout broadly; **no `git stash`**.

## Harness (from worktree root)
```
ln -sfn /Users/fraser/Documents/code/metabase/target        target
ln -sfn /Users/fraser/Documents/code/metabase/node_modules  node_modules
bun run test-unit-keep-cljs <spec>     # run from worktree root
```
See also `scripts/e2e-to-unit-instructions` seam catalogue in `.claude/skills/e2e-to-unit/SKILL.md`.

## Steps
1. `git show <fix_commit> --stat` and read the diff: the product change + the shipped e2e repro
   tell you the bug. Find where that logic lives NOW (it may have drifted).
2. **Find the seam** (pure fn / reducer / thunk / RTK-Query tag / router param / container render).
   Trace the e2e's assertion back to the nearest computable value. If the observable is only a real
   **browser measurement** (`getBoundingClientRect`/`ResizeObserver` pixels, CSS overflow) → it's
   irreducible; if it's backend `.clj[c]` → it's BE. See "no seam" below.
3. **Author the witness** as a real landed unit test at the seam (follow the file's conventions,
   lint-clean). Verify it PASSES on clean HEAD.
4. **Prove it discriminates**: apply a minimal semantic mutation reintroducing the bug → the witness
   FAILS (clean value/DOM assertion) → **revert the mutation** (product code back to HEAD, `git diff`
   on product files empty).
5. **Cull the e2e repro**: delete the block(s) titled `metabase#<issue>` / `describe("issue <n>")`.
   If other tests remain, delete only this block + any now-unused imports/helpers; keep the file
   linting. If it was the file's only test, `git rm` it.
6. **Final check**: product code UNCHANGED; a new/edited unit spec added; the e2e repro removed.
   Run the witness once more → PASSES.

## No seam (do NOT cull — leave the e2e in place)
- **Irreducible** (real-browser geometry/measurement, cross-page routing, browser API jsdom lacks):
  report `keep_e2e` + class, add NO unit test, DELETE nothing.
- **Backend** (`.clj[c]` fix): report `be_deftest` (a Clojure `deftest` is the oracle) + the seam,
  add NO jest test, DELETE nothing (a separate BE wave handles it).

## Report (end with)
1. **Outcome** — `landed` / `keep_e2e (class)` / `be_deftest`.
2. **Witness** — path + PASS-on-HEAD + FAIL-under-mutation (then reverted). (landed only)
3. **e2e culled** — spec path + block title(s) removed. (landed only)
4. **git diff --stat** — confirm product code untouched.
5. **Confidence** — why the witness is faithful (or why irreducible/BE).
