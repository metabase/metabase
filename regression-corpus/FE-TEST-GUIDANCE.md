# Reducing FE e2e reliance — what the corpus's FE holes teach us

_Derived from the frontend semantic-reconstruction results: 14 FE conflicts,
**9 unit-killable / 5 Cypress-guarded holes**. This doc dissects the 5 holes by root cause
and turns them into concrete structural guidance. The key claim: **~60% of the FE holes are
test-authoring gaps, not fundamental limits** — most FE e2e reliance for these bug classes
is avoidable._

## The pattern in the 9 kills vs the 5 holes

The **kills** were overwhelmingly **pure/near-pure logic**: `getTileUrl`, `getClickBehavior`,
`Field.remappedField`, `param-val-or-default`, `abbreviateFormat`, the selector, the
settings defaulter. When behavior is a function of inputs → outputs, jest catches it
trivially.

The **holes** were **behavior entangled with rendering, layout, routing, or integration**.
The tell: in every hole, **the fix's own unit-spec change was mechanical** (mock plumbing,
callback-arity, `within(root)` scoping, `waitFor`) with *zero behavioral assertions* — the
real assertion was punted to Cypress. That's the signal that the behavior wasn't structured
to be unit-observable.

## The 5 holes, by root cause

| # | Issue | Root cause | Fundamental? | How to close it at unit level |
|---|-------|-----------|--------------|-------------------------------|
| 1 | 58628 | **Missing state case** — the redirect-to-`/unauthorized` dispatch *is* unit-testable; the shipped unit tests only ran with permissions granted, so the guard never fired. | **No** | Add a thunk test with `hasDataPermissions: false` asserting `dispatch(replace(Urls.unauthorized()))`. |
| 2 | 61521 | **Integration point not asserted** — the fix extracted a *pure* helper (`updateVizSettingsWithRefs`, which *is* unit-tested) but the caller (`combineWithCartesianChart`) applying it isn't. | **No** | Unit-test `combineWithCartesianChart` with a `vizSettings` arg; assert `column_settings` remap. |
| 3 | 63745 | **Tested at the wrong level** — the bug is call-site state wiring (`ObjectDetailPanel`), but the specs mount only the *leaf* components with explicit props, so the stale-state path is unreachable. | **No** | Mount the container (`ObjectDetailPanel`) in RTL, toggle a column, assert the rendered value updates. |
| 4 | 69831 | **Layout measurement** — table full-width in embed. The *decision* (`\|\| isEmbeddingSdk`) is pure, but the *assertion* is a measured width; jsdom has no layout engine. | **Partly** | Unit-test the width *decision* function; keep the pixel assertion in e2e/visual. |
| 5 | 56771 | **Layout measurement** — column re-measure on query change. Same as #4: the *trigger* is testable, the *pixels* aren't. | **Partly** | Mock `getBoundingClientRect` and assert a re-measure was triggered on column change; pixel-perfect widths stay in e2e. |

**Tally: 3 of 5 are pure test-authoring/coverage gaps (closable now); 2 of 5 hit the jsdom
layout-measurement limit (decision closable, pixels not).**

## Structural recommendations (in impact order)

1. **Extract decision logic out of components into pure functions/hooks.** This is the
   single biggest lever and mirrors the backend result (large fixes localized to one pure
   function → trivially unit-killable). Every FE *kill* was a pure function; every *hole*
   had logic fused to rendering. Make the component a thin shell over tested logic.

2. **Test at the integration/container level, not just leaves.** Wiring/state bugs (63745,
   61521) live *between* components. Add container-level RTL tests that exercise the real
   composition, not just isolated leaves with hand-fed props.

3. **Cover the off-happy-path states.** Most holes were "the unit test only covered the
   happy path": permission-denied (58628), multi-datasource (61521), stale/toggled state
   (63745). A regression test for a bug should assert the *bugged* input path, not just
   that the fixed path still works.

4. **For layout/measurement, split the trigger from the pixels.** jsdom can't measure, but
   the *decision* ("should we re-measure? which columns?") can be unit-tested by mocking
   `getBoundingClientRect` (Metabase already has `mockGetBoundingClientRect` helpers). Keep
   only the pixel-exact result in e2e/visual-regression — a much smaller e2e surface.

5. **Types are complementary, not a substitute.** Tighter types (discriminated unions,
   exhaustive `switch`, branded ids) make some *invalid-state / shape* bugs unrepresentable
   — and a CI `tsc --noEmit` (`type-check-pure`) catches signature regressions like the
   56771 callback-arity change at compile time. But note jest runs via swc **without**
   type-checking, and most corpus bugs are *behavioral* (wrong value, missing dispatch,
   wrong branch) — those only tests can catch. Types shrink the input space; tests verify
   behavior within it.

## The honest limit

Layout/geometry/visual bugs (pixel widths, sticky positioning, real paint) and full
browser-integration flows (routing across pages, real network + redirects) are where e2e
**genuinely earns its keep** — and the corpus confirms it: those were the irreducible FE
holes. The goal isn't zero e2e; it's shrinking the e2e surface to *only* those, by moving
the ~60% that are logic/wiring/state coverage gaps down to jest.

## Proven — 10 closable holes closed (3 pilot + 7 from the exhaust run)

We did it, at scale. For each test-authoring-gap hole, a targeted jest test was written **at
the level the guidance prescribes**, each verified to **pass on clean HEAD and fail as a clean
assertion when the fix is reverted**. First the 3 pilot holes:

| Hole | Level applied | New test | Result |
|------|---------------|----------|--------|
| 58628 | **thunk-level** (drive `hasDataPermissions:false`) | asserts `dispatch(replace(unauthorized))` + bail | pass clean / fail w/o guard |
| 61521 | **integration-point** (the combine fn, not the helper) | asserts `column_settings` remap onto new refs | pass clean / fail w/o remap block |
| 63745 | **container-level** (mount `ObjectDetailPanel`, rerender) | asserts headers reflect fresh `passedData` | pass clean / fail w/ stale-state revert |

Then 7 more from the exhaustive `partial`/`all_specs_gone` sweep — each a hole only because a
spec drifted or was deleted; all closed and **verified passing together in the main tree (56
suites / 2124 tests green)**:

| Hole | Level | New test | Why it was a hole |
|------|-------|----------|-------------------|
| 54271 | **pure-fn** (`getXValues`) | assert `xValues.length===2` & `not.toContain(null)` before the spec's Dayjs filter | a `.js→.ts` migration added a `.filter(is Dayjs)` that silently ate the leaked null |
| 39812 | **reducer** (`tablesReducer`) | dispatch `cardUpdated` w/ moved collection, assert `schema`/`schema_name` sync | discriminating `schemas.unit.spec.js` deleted (#74085) |
| 36027 | **settings-pipeline** (`getComputedSettingsForSeries`) | empty stored `graph.dimensions/metrics` → recalc to `["col1"]/["col2"]` | `AddSeriesModal` spec deleted by visualizer refactor #48527 |
| 25533 | **thunk** (`setParameterValue`) | dispatch `("123", [])` → assert `null` | shipped jest edit was a default→named import rename |
| 41483 | **pure-fn** (`parseHashOptions`) | `"#foo=01" → {foo:null}` | parsing rerouted onto react-router `location.query` |
| 29122 | **pure-fn** (`serializeDateParameterValue`) | `dayjs.locale("fr")` → assert English `exclude-months-Mar` | English-only jest env can't see the locale bug |
| 49642 | **container** (`SingleSelectListField`) | typing fires `onSearchChange` + `onChange([])` | fix was cypress-only; jest edits were flake-fixes |

Every one mounted/ran cleanly — no jsdom impracticality. Patches + agent reports are saved per
entry (`hole-closer-test.patch`, `hole-closer-report.md`) and applied in the working tree,
ready to commit. This converts **10 FE Cypress-holes to unit-guarded**, confirming the study's
thesis: the FE e2e reliance that is coverage-gap/drift, not layout, is recoverable — and cheaply.

The holes we did **not** close were the honest ones: layout/geometry (31340 CSS truncation),
CLJC-migrated logic (29082, 52611 — best tested in Clojure), and heavy-integration thunks
(33208) — a small, well-characterized residue.
