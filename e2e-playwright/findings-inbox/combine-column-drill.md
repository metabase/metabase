# combine-column-drill

Source: `visualizations-tabular/drillthroughs/combine-column.cy.spec.ts`
Port: `tests/combine-column-drill.spec.ts` (+ `support/combine-column-drill.ts`)

2 tests, both green on the jar (slot 5) first try, 4/4 under `--repeat-each=2`.
tsc clean (the only tsc error is pre-existing in `duplicate-dashcards-tabs.spec.ts`).
No fixmes, no product-bug claims → no cross-check needed.

## Fixes classified (all known gotchas — no new ones)

- **Snowplow → no-op stubs** (rule 6). The spec is snowplow-tagged
  (`resetSnowplow` beforeEach, `expectNoBadSnowplowEvents` afterEach,
  `expectUnstructuredSnowplowEvent` in test 1). Stubbed to no-ops; the combine
  flow itself still runs fully.
- **Second popover on top of the combine popover** (rule 3 / column-shortcuts
  precedent). Re-selecting the second column reopens a column dropdown as a
  distinct popover → `popover(page).last()` to pick "Name".
- **`cy.findAllByRole("textbox").last()` / `findByLabelText("Separator")` →**
  `popover(page).getByRole("textbox").last().fill(...)`. `fill("")` and
  `fill("+")` are the faithful equivalent of Cypress `.clear()` /
  `.clear().type("+")`; the combine-example live-updates on the input event and
  `toHaveText` auto-retries.
- **Test 2's `cy.findAllByTestId("header-cell").contains(str).should("exist")`
  is `cy.contains`** (case-sensitive substring, first hit — NOT `findByText`) →
  `filter({ hasText: caseSensitiveSubstring(str) }).first()` + `toBeVisible`.
  "Combined Email, ID" is a substring of "Combined Email, ID_2", so both cells
  match the first regex; `.first()` mirrors cy.contains's first-hit semantics.
- `H.tableHeaderClick` → shared `notebook.ts tableHeaderClick`; drill menus are
  `popover()` scope.

## Reused (no re-implementation)

- `createQuestion` (factories), `visitQuestion`/`popover` (ui.ts),
  `tableHeaderClick` (notebook.ts), `caseSensitiveSubstring` (text.ts),
  `SAMPLE_DATABASE`/`SAMPLE_DB_ID` (sample-data.ts).

## New helpers (support/combine-column-drill.ts)

- `peopleIdEmailQuestionDetails` — the PEOPLE(ID, Email, limit 3) question both
  tests visit.
- `openCombineColumnsFromHeader(page, column)` — tableHeaderClick + click
  "Combine columns". This is the column-HEADER-drill entry to combine, distinct
  from the "+" Add-column-modal combine already covered by
  `column-shortcuts.ts combineColumns` (different UI, same domain).
