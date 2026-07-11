# E2E-only batch — is the "only Cypress ever tested it" population actually irreducible?

_Wave 1: 12 genuine **e2e-only** bugs (the fix and its Cypress repro shipped in one commit; no
unit test of any tier ever existed). Each was reconstructed on a `corpus-mutant/<issue>` branch,
paired with a **witness** attempt (a unit assertion proving the bug is unit-observable), and its
repro spec run in CI (`e2e-stress-test-flake-fix.yml`, `build_jar=true`). Evidence with run+job
IDs: `evidence/e2e-only-batch-wave1.jsonl`._

## Headline: 11/12 are unit-catchable; only 1 is genuinely irreducible

| Witness outcome | # | issues |
|---|---:|---|
| FE-replaceable (jest witness authored) | 10 | 62501, 60241, 63070, 67432, 63176, 63405, 65501, 67767, 54317, 59049 |
| BE-replaceable (Clojure `deftest`) | 1 | 68998 (backend `params.clj`) |
| Irreducible (layout/geometry, no unit seam) | 1 | 63711 (CSS `grid-auto-rows`) |

Combined with the CI e2e run:

| Verdict | # | what it means |
|---|---:|---|
| **REDUNDANT → cull** | 9 | e2e catches the bug **and** a unit/BE witness catches it → replace e2e with the witness |
| **VACUOUS e2e → cull** | 2 | e2e **passes** on the mutant (misses its own bug); the unit witness catches it → witness is strictly better |
| **INCONCLUSIVE** | 1 | 63711 — no unit witness possible; its e2e also passed on the mutant in headless CI → needs a targeted re-run |

## What this means

- **"e2e-only" is overwhelmingly a coverage gap, not a hard limit.** For bugs that *never* had a
  unit test, ~92% were still unit-catchable once someone tried — pure fns, Redux thunks,
  RTK-Query cache tags, router params, container renders (with `mockGetBoundingClientRect` + fake
  timers). Only a true CSS/geometry bug resisted.
- **Two shipped e2es are vacuous** (67767 tests at a viewport where the bug can't manifest; 62501's
  e2e didn't catch the reintroduced bug) — the witness is a *better* guard than the e2e it replaces.
- **The one irreducible case (63711) is doubly interesting**: its own e2e also failed to catch the
  CSS mutation in headless CI — a sign that layout/geometry e2e assertions can be fragile, not just
  that unit tests can't reach them.

## Caveats

- Wave 1 sampled the **single-file (`pf=1`) conflict** slice of the 851 usable e2e-only issues,
  which biases toward tractable, localizable fixes. Multi-file and `test_only` (repro-added-
  separately, 156) slices are not yet measured and likely have a higher irreducible rate.
- Witnesses are authored, not yet landed; the BE case (68998) needs a Clojure witness (not written).
- 63711 needs a targeted re-run (grep matched several tests, so the harness ran the whole file).
