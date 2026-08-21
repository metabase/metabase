# question-reproductions-3 (slot 5, port 4105) — QA-DATABASE tier

Source: `e2e/test/scenarios/question-reproductions/reproductions-3.cy.spec.js` (1294 lines)
Target: `e2e-playwright/tests/question-reproductions-3.spec.ts` + `support/question-reproductions-3.ts`
Artifact: local CI uberjar `target/uberjar/metabase.jar` (COMMIT-ID `751c2a98`, built 2026-07-18).

## Result

28 describes / 28 tests, ported 1:1 (nothing merged, dropped, or weakened).

| run | passed | gate-skipped | notes |
|---|---|---|---|
| gate ON (`PW_QA_DB_ENABLED=1`) | **27** | **1** | the 1 skip is upstream's `@skip`-tagged issue 10493, not a gate |
| gate ON, `--repeat-each=2` | **54** | 2 | 2× the same `@skip` |
| **gate OFF (control)** | **24** | **4** | 3 extra skips = the QA-DB describes |

The gate-off control is the FINDINGS #49/#67 check: turning the gate off removes
exactly 3 tests (38354, 40176, 42010), so the green run is **not** green-by-skipping.
`--repeat-each=2` was 54/54 with zero flakes.

`bunx tsc --noEmit`: clean.

### Gating breakdown (reported separately, per brief)

- **`@external` / QA Postgres — 2 tests**: `issue 38354` (`postgres-12` snapshot) and
  `issue 40176` (`postgres-writable` + `uuid_pk_table`). Both **executed and passed**.
- **`@mongo` — 1 test**: `issue 42010` (`mongo-5` snapshot, `orders` collection).
  **Executed and passed.** This is a distinct gating case: upstream CI's main leg
  runs `grepTags="-@mongo+…"`, so this test never runs there. The port carries a
  `@mongo` tag so the same exclusion is expressible.
- **Upstream `@skip` — 1 test**: `issue 10493` is `{ tags: "@skip" }` in Cypress and
  never runs in CI. Ported in full and `test.skip`ped with that reason rather than
  dropped, so it can be un-skipped when upstream does.

No `test.fixme`. No product-bug claims. No Cypress cross-check was run — correctly
declined: `H.restore()` re-points database 1 at the shared `e2e/tmp` H2 file and
would have broken the four sibling slots (PORTING 🔴 rule).

## Container evidence — the QA-DB path really executed

**`uuid_pk_table` relfilenode changed across a single test run** (the read-only
technique from the brief, `SELECT relfilenode FROM pg_class`):

```
before: [{"relfilenode":64404,"rows":"2"}]
run:    ✓ issue 40176 … @external (3.2s)
after:  [{"relfilenode":66680,"rows":"2"}]
```

A changed relfilenode means the table was genuinely dropped and recreated inside
the shared `writable_db` container by the port's `resetUuidPkTable` — the reset is
not a no-op and the test is not reading stale state.

For mongo, the test reads a non-deterministic ObjectId out of the first result
cell and filters on it; that value cannot come from H2, and mutating the source
`limit` moved the observed row count (see M2), so the mongo container is
demonstrably in the loop.

**FINDINGS #85 (shared `writable_db` debris) did NOT bite this spec.** Nothing here
touches schema/table *listing or ordering* — 40176 goes straight to a table id
resolved through `/api/table`. Reported as a non-reproduction, not a dividend.
`resetUuidPkTable` deliberately drops only its own `public.uuid_pk_table` and never
a foreign schema, so it is safe alongside the other live QA-DB agents.

## Mutation testing — 4 mutants, 4 killed, 0 survivors

Each inverts an **input** that no assertion references, per PORTING.

| # | mutation | died at | proves |
|---|---|---|---|
| M1 | one hex digit of the `uuid_pk_table` fixture UUID (`…a11` → `…a1f`), QA-DB only | the FINAL assertion, `Showing 1 row` (spec:569) | 40176 is end-to-end against the writable postgres container; the UUID filter is really evaluated there |
| M2 | mongo source `limit: 2` → `limit: 3` | `removeFilter`'s `Showing 2 rows` (helper:130) | the mongo query drives the row count — scenario 1 is not vacuous |
| M3 | 38354 picks source table `Orders` → `People` after switching DB | the FINAL `cell-data` `37.65` assertion (spec:338) | the QA Postgres12 data path is load-bearing all the way to the rendered cell |
| M4 | 39102 stage-1 filter `count > 1000` → `count > 1` | the **absence** assertion `preview "744" toHaveCount(0)` (spec:426), Expected 0 / Received 1 | that absence check is anchored and load-bearing, not satisfied by "nothing painted yet" |

M4 was chosen specifically because absence checks are the documented vacuity trap
(#73). It fired at the absence assertion itself — the anchor (`Count` + `3,610`
visible first) does its job.

**Stated limitation:** M2 dies in scenario 1, so issue 42010's *scenario 2* tail
(the notebook filter's final `Showing 1 row`) is not independently proven by a
mutant. It is gated stepwise — each action's effect is asserted before the next
(`ID is <id>` pill, then a real `/api/dataset` response awaited by `visualize`) —
but I could not construct an input-only mutation that reaches that assertion
without also changing what an earlier assertion reads. Recording it as unproven
rather than claiming otherwise.

## Fixes made during stabilisation (all port drift; classified per the feedback loop)

Run 1 was 23 passed / 4 failed / 1 skipped. All four were my drift, none an app bug.

1. **`issue 38176` — a retroactive `cy.wait("@cardQuery")` ported at the wrong
   point.** *(known gotcha, brief should have caught it)* Upstream waits for
   `@cardQuery` right after the description PUT, but the description edit re-runs
   nothing — the alias is satisfied by the **earlier play-button run**
   (`cy.wait` consumes past responses). Registered at the true trigger. 30s → 1.7s.

2. **`issue 40435` — second `visualize()` on a now-SAVED question.** *(known
   gotcha)* The shared `notebook.ts visualize` waits strictly on `POST
   /api/dataset`; after `H.saveQuestion()` the re-run goes through
   `POST /api/card/:id/query`. Added a spec-local `visualizeEitherEndpoint`.
   Note the fingerprint is misleading: the *click* succeeds, so the failure
   surfaces as a bare `waitForResponse` timeout with no hint that the endpoint
   moved.

3. **`issue 31960` — overlapping ECharts dots defeat a real hover.** *(NEW gotcha)*
   A weekly series inside a dashcard packs ~3px-radius circles a few px apart, so
   a **neighbouring circle path is topmost at the target's centre** and
   Playwright's actionability refuses (`<path … d="M1 0A1 1 0 1 1 1 -0.0001"…>
   intercepts pointer events`). `cypress-real-events`' `realHover` does no
   hit-testing, so upstream never saw it. `hover({ force: true })` fixes it and the
   tooltip still resolves to the intended point (the `July 13–19, 2025` header
   assertion confirms it). Generalise: **the wave-12 "ECharts pie/label hovers need
   `hover({force:true})`" rule extends to dense cartesian series in small
   containers**, not just pie labels — the mechanism is the same coordinate
   hit-test.

4. **`issue 43294` — both `QuestionDisplayToggle` segments are `disabled: true` by
   design.** *(NEW gotcha)* `QuestionDisplayToggle.tsx` marks both
   `SegmentedControl` options disabled and puts the real `onClick` on the control
   **root**; the icon is the label content. Playwright reports the icon as
   "element is not enabled" (not the aria-disabled variant — an actual `disabled`
   radio). `click({ force: true })` is correct here and matches PORTING's existing
   note that a SegmentedControl option survives force-click because the
   intercepting span is the click target's own child. This affects any port that
   toggles the QB's data/visualization switch.

## Notes / risks for whoever lands this

- **Data-derived values ported verbatim, as upstream has them**: `31960`'s
  `"July 13–19, 2025"` (upstream's own comment says "expect this to break when we
  shift years in the Sample Database"), `44532`'s `January 2026/2027/2028`,
  `43057`'s `November 18, 2027`, `39102`'s `3,610`/`744`. All pass on the local
  jar. Per the local-jar-drift rule these are the kind of value that can differ on
  CI's freshly-built jar; they are upstream's assertions, not mine, so I kept them
  rather than inventing behaviour-level substitutes.
- `TZ=US/Pacific` was used for every run (43057 and 31960 assert dates).
- Two helper-shape notes worth a consolidation pass later, both left alone here
  because shared modules are off limits: `actions-on-dashboards.ts resetTestTable`
  only knows two tables (this spec needed a third, `uuid_pk_table`), and the shared
  `notebook.ts visualize` is ad-hoc-only (see fix 2) — an `visualizeEitherEndpoint`
  belongs next to it.
- `resyncDatabase` was called with an explicit `tables: ["uuid_pk_table"]` per the
  🔴 brief note; the bare `{ dbId }` form would have gated on nothing here, since
  the `postgres-writable` snapshot's own tables satisfy it immediately.

## 3-line summary

Ported all 28 tests of `reproductions-3` 1:1; 27 executed / 1 upstream-`@skip` with
the gate on, 24/4 with it off — the control proves the 3 QA-DB tests (2 `@external`
Postgres, 1 `@mongo`, reported separately) really ran, and a changed
`uuid_pk_table` relfilenode proves the writable container was driven in-test.
Four input mutations were all killed — including one aimed at an absence check and
one that corrupts only QA-DB fixture data — and 54/54 passed under `--repeat-each=2`
with `tsc` clean; four run-1 failures were all my drift (retroactive `cy.wait`,
saved-vs-ad-hoc query endpoint, and two NEW gotchas: dense ECharts circles defeat a
real hover, and `QuestionDisplayToggle`'s segments are `disabled` by design).
