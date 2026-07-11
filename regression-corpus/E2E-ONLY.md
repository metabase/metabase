# The e2e-only population — how much is genuinely irreducible?

_The corpus's first two questions (mechanical revert, semantic reconstruction) covered bugs whose
fix **shipped a discriminating test**. This studies the harder, larger population: **e2e-only**
bugs — the fix + a Cypress repro shipped together, and **no unit test of any tier ever existed**.
If any population is "genuinely load-bearing e2e," it's this one. It mostly isn't._

## Method

For each bug: reconstruct it on a `corpus-mutant/<issue>` branch (semantic revert of the fix's
product change), then attempt a **witness** — a jest/BE unit assertion that passes on clean HEAD
and fails on the mutant, proving the bug is unit-observable. Separately, run the shipped e2e repro
against the same mutant in CI (`e2e-stress-test-flake-fix.yml`, `build_jar=true`) to get ground
truth. Briefs: `scripts/e2eonly-recon-instructions.md`, `scripts/mutation-witness.md`. Every
verdict is traceable to a CI run+job ID in `evidence/e2e-only-batch-wave{1,2}.jsonl`.

Population selection (`revert-check.jsonl` × `repro-tests.jsonl`, minus shipped-unit-test issues):
**851 usable e2e-only issues** (fix+repro same commit, single dedicated spec) + 156 `test_only`
(repro added separately — deferred). Sample so far: **27** (12 wave 1 + 15 wave 2), weighted in
wave 2 toward multi-file and seemingly-visual fixes to stress the irreducible rate.

## Result: ~96% is catchable by a cheaper test

| Witness outcome | count | share |
|---|---:|---:|
| **FE-catchable** (jest witness authored) | 25 | 93% |
| **BE-catchable** (Clojure `deftest`) | 1 | 4% |
| **Genuinely irreducible** (real-browser geometry) | 1 | 4% |

The lone irreducible case (**63711**) is a CSS `grid-auto-rows` bug whose observable is a real
`scrollHeight` overflow — jsdom does no layout and jest strips CSS. Everything else had a seam.

### CI ground truth (24 of 27 run; 3 witness-only from patch drift)

| verdict | count | meaning |
|---|---:|---|
| **REDUNDANT** | 19 | e2e *and* the witness both catch the bug → replace the e2e with the unit test |
| **VACUOUS** | 4 | e2e **passes on its own bug**; the witness catches it → the unit test is strictly better |
| **inconclusive** | 1 | 63711 — its e2e also missed the mutation in headless CI |

**Vacuous e2es are 4/24 (17%)** — a finding in its own right: 67767 runs at a viewport where the
bug can't manifest; 62501 missed the reintroduced bug; and **69722 is a geometry e2e (run-button
visibility) that its computed-height unit witness beat.**

## What the sample teaches

- **"e2e-only" ≈ "nobody wrote a unit test," not "can't."** Even in the population most likely to
  be irreducible, ~96% had a testable seam.
- **Seemingly-visual bugs reduce to computable values.** Map/dateline → marker *count* (5369);
  bar-chart labels → tick *options* (60475); editor overflow → a *computed* rem height (69722).
- **Multi-file fixes didn't raise the irreducible rate.** Every `pf=2` fix had a single
  load-bearing seam; the extra files were test hooks, snapshots, or `data-testid`s.
- **The irreducible line is precise: a browser *measurement*.** Layout driven by a JS computation
  is unit-testable (69722); layout requiring `scrollHeight`/`getBoundingClientRect` is not (63711).
- **Some e2es guard nothing.** 17% were vacuous — culling them loses no coverage regardless.

The forward-facing distillation is the **`e2e-to-unit` skill** (`.claude/skills/e2e-to-unit/`):
the seam catalogue, the irreducible classifier, and the witness verification, applied to new specs.

## Caveats / honesty

- **Sample bias.** 27 of 851, skewed toward single-file (`pf=1`) fixes and, in wave 1, more
  tractable areas. Treat ~96% as an optimistic upper bound until larger/harder slices (deep
  multi-file, the 156 `test_only`) are measured.
- **Logic vs wiring.** A seam unit test replaces the *logic*, not the proof that the real flow
  *calls* the seam. Some culls should keep a thin container/integration smoke test.
- **Witnesses are authored, not landed.** 68998 needs its Clojure witness written; 59671's crash
  site is partly superseded by later upstream hardening (the witness injects the historical shape).
- **3 CI runs were skipped** (59671, 51717, 56094) because their mutation patches didn't apply to
  `origin/master` (worktree fork-drift); their witnesses stand, without CI confirmation.

## Artifacts
- Per bug: `bugs/<issue>/e2eonly.yaml`, `mutation.patch`, `witness.patch`, `e2eonly-report.md`.
- Evidence: `evidence/e2e-only-batch-wave1.jsonl`, `evidence/e2e-only-batch-wave2.jsonl` (run+job IDs).
- Pilot that validated the CI loop + the witness guard: `E2E-ORACLE-PILOT.md`.
