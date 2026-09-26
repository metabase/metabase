# Reconstruction report — metabase#68819 (FE, partial/all_specs_gone bucket)

_Verbatim report (a6ea9eddf3c946c2a)._

---

Files restored to the fixed HEAD version. This is an honest negative — let me report.

## Report

**Outcome: `reconstruction_failed` (honest negative — no discriminating jest oracle)**

### What the fix did
`git show c3715127e2c48ea8779027ac65e85ec20bad360f` — fix for bug metabase#68819 ("stacked bar chart crashes when card has multiple same-type aggregations"). Product changes:
- `frontend/src/metabase/visualizations/lib/utils.js` (now renamed to `utils.ts`) — `getSingleSeriesDimensionsAndMetrics`: replaced the two-branch `metricColumns.length === 1` / `dimensionNotMetricColumns.length === 1` guard with a single `dimensionNotMetricColumns.length <= maxDimensions && metricColumns.length <= maxMetrics` guard. This is the actual crash fix (2 metrics + 2 breakouts previously fell through to `[null]`).
- `frontend/src/metabase/visualizations/shared/settings/cartesian-chart.ts` — `getDefaultDimensions`/`getDefaultMetrics`: added a `columnsAreValid(...)` guard to `canReusePrevious`.

The fix's genuinely discriminating regression test was the **Cypress e2e** `describe("issue #68819")` in `e2e/test/scenarios/visualizations-charts/visualizations-charts-reproductions.cy.spec.ts` — not a jest oracle, so unavailable here.

### Both listed jest oracles are non-discriminating
I applied a hand-written semantic revert of **both** product files (not `git apply -R`) and ran all candidates:

- `frontend/src/metabase/visualizations/shared/settings/cartesian-chart.unit.spec.ts` — baseline `Tests: 6 passed`; reverted `Tests: 6 passed`. The 4 fix-added tests don't discriminate: tests 1–2 ("ignores previous … missing columns") run with defaults *available* (`defaultX[0] != null`), so the new `columnsAreValid` branch is never reached; tests 3–4 ("reuses previous … columns are valid") use *valid* prev columns, and the reverted code was strictly *more* permissive about reuse, so it returns the same result. No added test covers the discriminating case (defaults unavailable AND prev columns invalid).
- `ChartNestedSettingSeriesMultiple.unit.spec.js` (moved to `frontend/src/metabase/dashboard/components/DashboardChartSettings/`) — baseline and reverted both `Tests: 5 passed`. The fix's cols change (adding `source: breakout`/`aggregation` + `display_name`) supports series-naming; each series is single-metric, so it never hits the multi-same-aggregation crash path.
- `frontend/src/metabase/visualizations/lib/utils.unit.spec.ts` (adversarial extra check) — reverted `Tests: 29 passed`. The crash config (2 aggregations + 2 breakouts) is not unit-tested anywhere.

### failure_shape
None. No jest assertion in any surviving oracle flips from pass→fail under a faithful product revert.

### Confidence + adversarial
High confidence in the negative. Adversarial checks performed: (1) reverted both product files, not just one; (2) verified the revert is real (same spec file, both states run and both pass — symlinks/cwd are fine, ruling out the "both pass ⇒ wrong cwd" trap); (3) reasoned through each of the 4 new cartesian tests and confirmed each coincides pre/post-fix; (4) ran the un-listed `utils.unit.spec.ts` to confirm no crash-path coverage lives there either. Files restored to clean HEAD (fix present).

### Category + reconstructable?
- Category: **PARTIAL — surviving jest specs are non-discriminating supplements.** The one discriminating test that exercised the crash (multiple same-type aggregations) shipped only as the Cypress e2e reproduction, which is outside the jest oracle set.
- Reconstructable? **Not via jest.** Would require the e2e spec (or a new unit test constructing a rawSeries with 2 aggregation cols + 2 breakout cols and asserting `getDefaultColumns`/`getSingleSeriesDimensionsAndMetrics` returns real column names rather than `[null]`).
