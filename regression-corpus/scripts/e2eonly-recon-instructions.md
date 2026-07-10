# E2E-only reconstruction + witness task

This bug's fix shipped **only a Cypress e2e repro** — no unit test. Your job is two things:

1. **Reintroduce the bug** in the CURRENT product code (semantic revert of the fix commit's
   product change — the code may have drifted, so reintroduce the *behavior*, not a blind
   `git apply -R`). Leave this mutation in the worktree.
2. **Author a WITNESS** — a minimal **jest unit test** that PASSES on clean HEAD and FAILS on
   your mutant, proving the mutation changed observable behavior *at the unit level*. The
   witness doubles as the candidate unit replacement for the e2e. Save it as a new/added spec.

You work in an isolated git worktree. Never touch the main tree; never git reset/stash broadly.

## Harness (from worktree root)
```
ln -sfn /Users/fraser/Documents/code/metabase/target        target
ln -sfn /Users/fraser/Documents/code/metabase/node_modules  node_modules
bun run test-unit-keep-cljs <spec>     # run from worktree root
```

## Method
1. `git show <fix_commit> --stat` and read the diff — the product change + the shipped e2e repro
   tell you what behavior the bug has. Locate where that logic lives now.
2. Apply a **minimal semantic revert** to current product code that reintroduces the bug.
3. **Try to author a witness**: find the pure/near-pure seam in the reverted logic and write a
   jest assertion on it (a value/DOM assertion at the mutation site, or on the exported fn).
   Verify: PASSES on clean HEAD, FAILS on the mutant (clean assertion, not a compile error).
   - If you succeed → the bug is unit-catchable → outcome `witness_authored`.
   - If the behavior only manifests through full render / routing / real browser / layout and
     **no** unit assertion can discriminate it → outcome `no_witness` (the e2e is genuinely
     load-bearing/irreducible). Explain precisely why (what makes it un-unit-testable).
4. Leave the **product mutation** in the worktree (so CI can run the e2e against it). Put the
   witness test content in your report (and leave it applied too if `witness_authored`).

## Report (end with these sections)
1. **git diff (product mutation)** — the semantic revert.
2. **Witness** — the jest test you added (or "none — <reason>"). Oracle command + PASS-on-clean /
   FAIL-on-mutant results with the assertion message.
3. **Bug summary** — what the reintroduced bug does (the behavior the e2e repro checks).
4. **Outcome** — `witness_authored` (bug is unit-catchable → e2e replaceable) or `no_witness`
   (irreducibly e2e; say which class: layout/geometry, routing/multi-page, real-network, browser API).
5. **Confidence** — why the mutation faithfully reintroduces the bug; if `no_witness`, why no unit
   seam exists.
