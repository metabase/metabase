# binning-23851-drill-temporal-extraction

Source: `binning/reproductions/23851-drill-temporal-extraction.cy.spec.js`
Target: `tests/binning-23851-drill-temporal-extraction.spec.ts`

- 1 test, ~55 lines. Passed on the jar (slot 4) first try; 2/2 under
  `--repeat-each=2`; tsc clean.
- No new helpers needed — entirely covered by the shared support surface
  (`chartPathWithFillColor` from binning.ts, `createQuestion` + `visitQuestion`,
  `waitForDataset`, `openNotebook`/`getNotebookStep`, `mb.api.put`). No
  `support/binning-23851.ts` was created.

## Fixes / classifications

- **`cy.intercept("POST","/api/dataset")` + `cy.wait("@dataset")`** →
  `waitForDataset` registered before the drill click (PORTING rule 2). Known
  gotcha, avoided.
- **`cy.findAllByTestId("cell-data").should("contain","37.65")`** is an
  ANY-match (PORTING rule 3) → `getByTestId("cell-data").filter({ hasText:
  "37.65" }).first()`. Known gotcha, avoided.
- **`H.createQuestion(details, { visitQuestion: true })`** → `createQuestion` +
  `visitQuestion(page, id)`. Known gotcha.
- `filter-pill` `should("have.text", …)` ported directly to a single
  `toHaveText` (matches the table-drills precedent; not transient).

## Dividends

None. No fixme, no product-bug claim, no strengthened assertion.
