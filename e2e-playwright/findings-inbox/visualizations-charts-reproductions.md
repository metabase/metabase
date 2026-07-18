# visualizations-charts-reproductions

Port of `e2e/test/scenarios/visualizations-charts/visualizations-charts-reproductions.cy.spec.ts`
(952 lines, no gating tags) → `tests/visualizations-charts-reproductions.spec.ts`.
New helpers in `support/viz-charts-repros.ts` only.

Verified on the jar (slot 4, `JAR_PATH` uberjar `751c2a98`): **40 passed, 2
skipped** under `--repeat-each=2` (58s). tsc clean.

## Result

- 20 tests ported. 19 run on the jar; 1 (issue 55853) is
  `@external`-by-construction (restores `postgres-12`, creates a card against
  the writable QA Postgres DB) → `test.skip` gated on `PW_QA_DB_ENABLED`,
  matching the existing document-title / embedding-reproductions ports.
- No `test.fixme`, no product-bug claims → no fidelity cross-check needed.

## Fixes classified (all port-drift, caught by the jar run — none are app bugs)

1. **`openObjectDetail` strict-mode double match (issue 41133).** The table
   renders two `role="row"` elements per `data-index` (frozen + scroll layers);
   only one carries the `detail-shortcut`. Cypress's `cy.get([data-index=0])`
   yields the set and acts on the first-with-the-child. Ported with
   `.filter({ has: detail-shortcut }).first()`. *Known-gotcha-adjacent* (rule 3
   multi-match), no brief change needed.

2. **Pie-slice hover intercepted by its own data label (issue 63026).** The
   wedge's `<text>` label sits over the path in the DOM, so Playwright's
   actionability refuses the hover; Cypress's synthetic `trigger("mousemove")`
   ignores DOM topmost. Fixed with `hover({ force: true })` — zrender hit-tests
   by coordinate, not DOM stacking, so the wedge tooltip still opens. This is a
   *new, small* gotcha: **ECharts pie/label hovers need `{ force: true }`**
   because the label overlays the slice. Candidate for PORTING.md if it recurs.

3. **Mixed-content text node (issue 41133, "is connected to:").** Recurrence of
   the documented mixed-content gotcha: `is connected to:` is a bare text node
   sharing its `<Text>` with a bold `<span>` (the row name), so testing-library
   exact matched the direct text node while Playwright exact compares full
   element text. Ported as a case-sensitive substring regex `/is connected to:/`.
   *Known gotcha* — reinforces the existing rule.

## No migration dividends

The fixes are all harness-mechanics; none strengthened an assertion or exposed
a Cypress-masked app issue. Faithful port throughout.

## Consolidation candidates flagged in the new module

- `assertEChartsTooltip` here adds `footer` / `secondaryValue` / `blurAfter` over
  the header/rows-only version in `viz-tabular-repros.ts` — fold together.
- `echartsTooltip`, `chartGridLines`, `cartesianChartCircleWithColor`,
  `vizSettingsSidebar` are generic `H` chart helpers → belong in `charts.ts`.
- `moveDnDKitElementVertically` is identical to
  `question-settings.moveDnDKitElementSynthetic`.
- `addQuestionToDashboard` duplicates `api/addQuestionToDashboard.ts` — could
  live on `MetabaseApi`.
