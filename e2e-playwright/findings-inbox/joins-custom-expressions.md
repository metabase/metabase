# joins-custom-expressions

Source: `e2e/test/scenarios/joins/joins-custom-expressions.cy.spec.ts`
Target: `tests/joins-custom-expressions.spec.ts`
New helper file: `support/joins-custom-expressions.ts`

## Result

2 tests, both green on the jar (slot 5, `JAR_PATH` + `PW_PER_WORKER_BACKEND`)
first try, and 4/4 under `--repeat-each=2`. tsc clean. No fixmes, no product-bug
claims — so no Cypress cross-check needed.

## Fixes / notes (all mechanical, no dividends)

- Clean port. Every interaction mapped onto existing shared helpers
  (`join`, `openTableNotebook`, `visitModel`, `miniPicker`, `filterNotebook`,
  `enterCustomColumnDetails`, `visualize`, `assertQueryBuilderRowCount`,
  `assertTableRowsCount`, `popover`, `ORDERS_MODEL_ID`).
- The join mini-picker in these tests navigates by clicking entries
  ("Our analytics" → "Orders Model"; "Sample Database" → "Reviews") rather than
  searching, so `joinTable` (which type-searches) was not the right tool — the
  clicks are inline via `miniPicker(page).getByText(...)`.
- One new helper only: `addJoinConditionCustomExpression(page, formula)` folds
  the repeated `popover → "Custom Expression" → enterCustomColumnDetails →
  "Done"` idiom (used 4×). The shared `enterCustomColumnDetails` (notebook.ts)
  handles the join-condition CodeMirror editor fine — same
  `custom-expression-query-editor` testid — including the select-all+delete that
  clearing the pre-filled "1" on update requires.
- `cy.button("Done"/"Update"/"Add filter")` inside `H.popover().within` →
  `popover(page).getByRole("button", { name, exact: true })`.
- `findByPlaceholderText("Enter an ID").type("1")` → `fill("1")` (no
  debounce/dropdown dependency here).
- `getByLabel("Left column"/"Right column"/"Change operator"/"Change join
  type", { exact: true })` for the join-step labelled controls (rule 1: exact).

## Consolidation candidate

`addJoinConditionCustomExpression` is a natural fit for `support/joins.ts` if a
future join spec needs custom-expression conditions — kept out of shared files
per the per-agent rule.
