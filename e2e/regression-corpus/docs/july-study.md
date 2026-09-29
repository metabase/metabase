# The July study

The first pass over this corpus ran in July 2026. It asked whether an e2e repro test can be deleted because a cheaper unit test or deftest already catches the same bug. Its write-ups and per-entry results are kept outside git (the README says where), so this note keeps its method and findings, in the terms `record.yaml` uses.

## How the July entries were built

July collected every e2e test title that names an issue, such as `(metabase#12345)` or `describe("issue 12345")`, which gave 1,231 issues. For each one it took the commit that added the repro title as `fix_commit`, and checked whether the fix's product diff, with test files left out, still reverse-applied on master:

| Fix diff on master | Issues |
| --- | ---: |
| Reverse-applies cleanly | 37 |
| Conflicts | 1,035 |
| Changes only tests | 156 |
| No commit found | 3 |

The 37 clean reverters keep the fix as `inverse.patch` (`method: inverse`, unless the entry has a `rebuilt/` mutant now). For the conflicts, an agent read the fix and reintroduced the same behaviour in the current code, saved as `reconstruction.patch`, or `mutation.patch` for the e2e-only entries below (`method: reconstructed`). Most conflicts were files that had moved rather than logic that had been rewritten, so even fixes spanning 8 to 41 files usually came down to a one-line mutant.

A mutant was accepted when the test that shipped with the fix failed on it with an assertion and passed clean. July called that test the oracle, and it's `hint.test` now. July then ran the unit suites against each mutant, using `jest --findRelatedTests` on the mutated files and `./bin/test-agent :module` for the backend.

The e2e-only entries are bugs whose fix shipped a Cypress repro and no unit test of any kind. Each has `mutation.patch` and usually `witness.patch`, a jest test or deftest that passes clean and fails on the mutant. July pushed each mutant to a `corpus-mutant/<issue>` branch and ran its repro spec in CI with `e2e-stress-test-flake-fix.yml` and `build_jar=true`, the same loop `generators/dispatch-e2e.sh` runs.

## What July found

Reconstruction works when the fix's own test survives. 20 of the 22 backend fixes whose added deftests still existed were reconstructed with a clean assertion failure.

Most e2e-only bugs can be caught without a browser. July found a jest or deftest witness for 38 of the first 42 e2e-only bugs, and the other 4 needed a real browser measurement: `getBoundingClientRect`, scroll geometry or `ResizeObserver`. That distinction is what `lowest_level: browser-measurement` records. The sample leaned towards single-file fixes, and the last 15 were hand-picked towards layout, scroll and routing bugs, so neither number is a population rate.

Some e2e repros don't catch their own bug. Of the 39 e2e-only mutants run in CI, 7 left their own repro green. A witness killed 5 of those, and July classed the other 2 as browser-measurement bugs, so nothing caught them in headless CI. In a separate pilot of 12 bugs that a unit test already killed, 3 of the e2e repros stayed green on the mutant.

Where a frontend bug did depend on e2e, the fix's unit-spec change was usually mechanical, such as a prop rename, a `waitFor` or mock plumbing, and the assertion on the behaviour was only in Cypress. July traced these to four causes:

- The unit tests never set up the failing state. 58628's tests all ran with data permissions granted, so the redirect for a user without them never ran.
- A helper was tested and its caller wasn't. 61521's fix added a tested helper, but nothing tested that `combineWithCartesianChart` applies it.
- The tests mounted leaf components with explicit props, so they couldn't reach a bug in the container's state. 63745's bug was in `ObjectDetailPanel`, which the fix's tests didn't mount.
- The assertion is a measured width, which jsdom can't produce (69831, 56771). The decision that sets or triggers the width is still unit-testable.

A later sweep found one more: a spec that used to catch the bug was deleted or drifted off the code path in a refactor. July closed 14 of these frontend gaps with a unit test at the right level, each passing clean and failing on the mutant.

## Lessons

These July lessons are built into the record and the kill rules:

- A raw failure in a 10,000-test `findRelatedTests` run is often load flake. 4 of 6 raw kill candidates among the clean reverters passed when rerun on their own, so a kill has to reproduce on a rerun in isolation.
- `./bin/test-agent` run from the main checkout compiles the main checkout, not the worktree with the mutant in it, so every test passes. Tests run in the worktree the patch is applied to.
- A crash counts as a kill only when it's the bug's own symptom. 22449's July mutant reintroduced a crash instead of the bug, and the shipped test flipped on it by erroring, so July rejected it. A setup crash, a harness error, or a timeout that isn't the bug's own symptom is recorded as an error.
- The reporting test doesn't define the bug. 39053's fix commit was mis-attributed, 45073's named test was the wrong one, and one fix-added deftest was always true because of a fixture bug. `hint` is only where to start.
- A test failing on a mutant doesn't prove the mutant is the bug. 25614's July mutant dropped the Stack-100% scaling from the bars as well as the trend line, so the test that failed was a bar test, and the e2e stayed green because the trend line was still visible. `bug.statement` identifies the bug, and 26 entries have a `rebuilt/` mutant for this reason or because the July patch stopped applying.
- The unit tests that killed a mutant often shipped with the fix. That shows the bug is guarded now, not that the suite would have caught it at the time, so `fix_tests` records them and results are reported with and without them.
- A bug July couldn't reconstruct is unknown, not safe to cull. Those entries have no patch and are `status: retired`.

Where later work contradicted July, the record follows the later work and its `notes` say so. For example 67399, one of July's four browser-measurement bugs, has a jest test now and is `lowest_level: unit`.
