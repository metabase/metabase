# E2E-oracle pilot — do the e2e repros actually catch their bug?

_Pilot over 12 corpus **unit-kills** that also ship a dedicated e2e repro. For each, the saved
semantic-revert (`reconstruction.patch`) was re-applied to a `corpus-mutant/<issue>` branch off
master, then the repro spec was run in CI via `e2e-stress-test-flake-fix.yml`
(`grep=metabase#<issue>`, `burn_in=5`, `build_jar=true` so the FE mutation is live). The e2e
result tells us whether the e2e catches the same bug the unit test already catches._

## Result: **9/12 e2e repros catch the bug; 3/12 miss it** (unit test strictly stronger)

| Issue | e2e verdict | spec | run |
|---|---|---|---|
| 55686 | ✅ catches | `custom-column/custom-column-reproductions-2.cy.spec.js` | [run](https://github.com/metabase/metabase/actions/runs/29125325968) |
| 47757 | ✅ catches | `visualizations-charts/visualizations-charts-reproductions.cy.spec.ts` | [run](https://github.com/metabase/metabase/actions/runs/29125361982) |
| 66210 | ✅ catches | `question-reproductions/reproductions.cy.spec.ts` | [run](https://github.com/metabase/metabase/actions/runs/29125367144) |
| 14595 | ✅ catches | `filters-reproductions/dashboard-filters-reproductions-2.cy.spec.js` | [run](https://github.com/metabase/metabase/actions/runs/29125372340) |
| 25614 | ⚠️ misses | `visualizations-charts/trendline.cy.spec.js` | [run](https://github.com/metabase/metabase/actions/runs/29125377382) |
| 31662 | ⚠️ misses | `filters-reproductions/dashboard-filters-reproductions-1.cy.spec.js` | [run](https://github.com/metabase/metabase/actions/runs/29125382789) |
| 38699 | ✅ catches | `admin-2/whitelabel.cy.spec.js` | [run](https://github.com/metabase/metabase/actions/runs/29125387980) |
| 39993 | ⚠️ misses | `models/reproductions-1.cy.spec.ts` | [run](https://github.com/metabase/metabase/actions/runs/29125392993) |
| 42656 | ✅ catches | `metrics/metrics-dashboard.cy.spec.js` | [run](https://github.com/metabase/metabase/actions/runs/29125398476) |
| 44316 | ✅ catches | `collections/collections.cy.spec.js` | [run](https://github.com/metabase/metabase/actions/runs/29125403624) |
| 49304 | ✅ catches | `custom-column/custom-column-reproductions-1.cy.spec.js` | [run](https://github.com/metabase/metabase/actions/runs/29125408807) |
| 45255 | ✅ catches | `visualizations-charts/visualizations-charts-reproductions.cy.spec.ts` | [run](https://github.com/metabase/metabase/actions/runs/29125414104) |

## Interpretation

- **9 "catches"** — the e2e fails on the mutant with a real Cypress assertion (verified: e.g.
  #55686 → "Unable to find an accessible element with the role \"option\"", 5/5 failing). Both the
  unit test **and** the e2e catch the bug → the e2e repro is **redundant** (strongest cull evidence).
- **3 "misses"** (25614, 31662, 39993) — the repro **executed** (5/5 burn-in passing, not a
  0-test artifact) yet stayed green with the bug live → the **unit test is strictly more sensitive**
  than the e2e. The e2e was weak coverage for that regression; culling it loses nothing the unit test
  does not already cover.
- **Either outcome supports culling** all 12: catch → redundant; miss → unit test is better anyway.

## Methodological lessons (for scaling to the ~1,000 e2e-only population)

1. **The loop works and is cheap.** branch → push (no PR → **no other workflow triggered**) →
   `gh workflow run` → collect. Runs completed in ~11–15 min each, fully parallel. `build_jar=true`
   demonstrably includes FE mutations (proven by the 9 catches).
2. **One spec is the oracle** (confirmed: 98% of repros are single-spec) — `grep=metabase#<issue>`
   isolates the exact block, keeping each run to one test × burn-in.
3. **A passing mutant is AMBIGUOUS when the e2e is the only oracle.** Here we knew the bug was real
   (unit test catches it), so "e2e passes" cleanly means "e2e less sensitive". But for the true
   e2e-only population there is no unit oracle, so a passing e2e could mean *either* a vacuous/zombie
   repro *or* a reconstruction that did not actually reintroduce the bug. This is handled by the
   **mutation-witness guard** (see below).

## Mutation-changed guard (built + validated)

To disambiguate a passing mutant, every mutant is paired with an independent **witness** — a check
*separate from the e2e's assertions* that is green on clean HEAD and red on the mutant, proving the
mutation actually changed behavior. Design + decision table: `scripts/mutation-witness.md`.

Validated on this pilot's 3 "misses" by running each one's unit oracle against the mutant:

| Issue | e2e on mutant | unit **witness** on mutant | verdict |
|---|---|---|---|
| 25614 | passes | **fails** — `dataset.unit.spec.ts` ✕ "should return an array of normalized datasets" | e2e **VACUOUS** → cull |
| 31662 | passes | **fails** — `parsing.unit.spec.ts` 34 failed / 134 passed | e2e **VACUOUS** → cull |
| 39993 | passes | **fails** — `sync-viz-settings.unit.spec.tsx` 9 failed / 11 passed | e2e **VACUOUS** → cull |

So all 3 passes are confirmed **genuine vacuousness** (bug live, e2e blind to it), not failed
reconstructions. For the e2e-only population the witness is authored by the reconstruction agent
(same discipline as the FE hole-closers); if no witness can be made to fail, the mutant is discarded
rather than scored.

## CI evidence (durable)

Full run **and** job IDs, job URLs, mutant SHAs, and witness results are recorded in
`evidence/e2e-oracle-pilot.jsonl` (one row per mutant), so every verdict is traceable to a specific
CI job. Run workflow: `e2e-stress-test-flake-fix.yml`. Mutant branches `corpus-mutant/*` were deleted
after recording the run/job IDs (throwaway; no PRs opened) — the runs themselves persist.
