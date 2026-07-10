The working tree is clean and restored. I have enough to report.

## Reconstruction result: `reconstruction_failed`

**(1) git diff:** None. Working tree is clean (I reverted my probe edits). No reconstruction shipped.

**(2) Oracle used + baseline/reconstructed:**
- Oracle: `bun run test-unit-keep-cljs frontend/src/metabase/visualizations/lib/settings/graph.unit.spec.ts` (the shipped `graph.unit.spec.js` was renamed `.js`→`.ts`; product `graph.js`→`graph.ts`).
- Baseline: `Tests: 40 passed, 40 total`.
- Reconstructed (semantic revert of this fix's `graph.ts` changes — `tooltip_type` getDefault back to unconditional `"series_comparison"`, and re-adding the `tooltip_type === "default"` early-return in `graph.tooltip_columns.getHidden`): `Tests: 40 passed, 40 total`. **No failure.** Not discriminating.

**(3) failure_shape:** None achievable (no jest assertion flips).

**(4) Confidence + adversarial check:** High confidence this is a true honest-negative.
- The fix commit's *shipped* `graph.unit.spec.js` edits were **non-discriminating cleanup**: it *deleted* the one discriminating test ("should be hidden when tooltip type is default") and merely relaxed two constant strings (`"customized"`→`"series_comparison"`). Those two surviving `getHidden` tests pass `tooltip_type: "series_comparison"`, so the reintroduced `=== "default"` branch never fires — confirmed by re-running (still 40/40).
- The real behavioral fix for metabase#50630 ("tooltip shows non-hovered breakout series") lives in `CartesianChart/events.ts` (`getTooltipModel` → new `getSingleSeriesTooltipModel` with the `seriesToShow = filter(series === hoveredSeries || !isBreakoutSeries)` guard). Grep confirms **no jest spec references `getTooltipModel`**, and `events.unit.spec.ts` covers only `getEventDimensions`/`canBrush`/`getTimelineEventsForEvent` — not the tooltip model. The discriminating oracle was the e2e `scatter.cy.spec.js` (`assertEChartsTooltipNotContain(["Gizmo","Gadget","Doohickey"])`), which is Cypress, not jest.
- Adversarial: the one tempting current jest test — `graph.unit.spec.ts:659` "should return all available columns on scatter charts by default" — was introduced by a **later** commit `f99b8baa5f5` (#51480 "show all columns in scatter tooltip by default"), not this fix (verified via `git log -S`). Its underlying `getAvailableAdditionalColumns`/`metricsOnly` logic from the fix has since been fully refactored away in `cartesian-chart.ts`, so it does not track this fix commit.

**(5) reconstruction_failed:**
- category: **cypress** (discriminating oracle is `e2e/test/scenarios/visualizations-charts/scatter.cy.spec.js`; the shipped jest-spec changes were non-discriminating and the core fix in `events.ts` has zero jest coverage).
- reconstructable (as a jest failure)? **No**, not against the surviving suite without authoring new tests. The behavior is verifiable via Cypress, or would require a *new* jest spec exercising `getTooltipModel`/`getSingleSeriesTooltipModel` breakout-series filtering (no such spec exists to serve as an unmodified oracle).