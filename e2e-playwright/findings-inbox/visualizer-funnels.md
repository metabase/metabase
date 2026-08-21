# visualizer-funnels

Port of `e2e/test/scenarios/dashboard/visualizer/funnels.cy.spec.ts` →
`tests/visualizer-funnels.spec.ts`. 3 tests, all green on the jar (slot 5,
COMMIT-ID 751c2a98), 6/6 under `--repeat-each=2`. tsc clean.

## Result
- 3/3 pass, no fixmes, no product-bug claims, no cross-check needed.

## Fixes / deviations classified
None required beyond mechanical Cypress→Playwright mapping:
- `H.modal().within(...)` → well/data-importer helpers scoped to `page`
  (the shared helpers already resolve inside the visualizer modal).
- `cy.button("Add more data")` / `cy.button("Done")` → the modal-scoped
  `switchToAddMoreData` / `switchToColumnsList` helpers (cartesian precedent).
- `cy.findByText(...).should("not.exist")` → `getByText(..., {exact:true})
  .toHaveCount(0)`; `should("exist")` → `.toBeVisible()`.
- Dropped the three never-awaited intercepts (@dataset, @cardQuery,
  @dashcardQuery) — this spec never waits them and `selectDataset` waits the
  card query internally.

## Dividend flagged (consolidation)
- **No new helpers were needed.** Every fixture (STEP_COLUMN_CARD,
  VIEWS_COLUMN_CARD, SCALAR_CARD, the *_BY_* questions) and every UI helper
  (wells, dataImporter, selectDataset, assertDataSourceColumnSelected,
  select/deselectColumnFromColumnsList, removeDataSource, dataSourceColumn)
  already existed in `support/visualizer-basics.ts` + `support/
  visualizer-cartesian.ts`. So `support/visualizer-funnels.ts` was NOT created
  — the helper index needs no regeneration.
- This is more evidence for the standing consolidation candidate: the visualizer
  helper surface split across visualizer-basics / visualizer-cartesian /
  dashboard-card-repros should become one `support/visualizer.ts`. The funnels
  spec needed `dataSourceColumn`/`removeDataSource`/`selectColumnFromColumnsList`
  from cartesian and the rest from basics — a clean unified module would have
  been a single import.
