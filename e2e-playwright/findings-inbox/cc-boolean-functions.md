# cc-boolean-functions

Source: `custom-column/cc-boolean-functions.cy.spec.ts` → `tests/cc-boolean-functions.spec.ts`

- 13 tests, all green on the jar (slot 2), 26/26 under `--repeat-each=2`. tsc clean.
- No fixmes, no product-bug claims — no Cypress cross-check needed.

## Fixes / classification

All mechanical, all covered by existing gotchas — nothing new:

- **`assertTableData` firstRows numbers → strings.** Upstream wrote two count
  cells as the number `1` (`[["false", 1], ["true", 1]]`); `assertTableData`
  asserts `have.text`, so the rendered cell is the string `"1"`. Ported as
  `"1"`. (Known: Playwright `toHaveText` requires a string.)
- **`cy.wait("@dataset")` folded into `visualize()`.** The shared `visualize`
  helper already awaits `POST /api/dataset`, so the trailing `cy.wait("@dataset")`
  is a no-op in the port. The dataset intercept is only materially needed for
  the dashboard click-behavior drill (a cell click navigates to an ad-hoc
  question) — waited on explicitly there with a local `waitForResponse`.
- **`findByText("false")` / `findByLabelText("True")` → exact.** Rule 1 —
  testing-library string args are exact.
- **`icon("add")` / `icon("arrow_up")` → `.locator(".Icon-add")` etc.** scoped
  to the notebook step (and to `aggregate-step` where the breakout section also
  carries an add affordance) — mirrors the custom-column-3 precedent.

## Reuse

Heavy reuse, no shared-file edits:
- `createQuestion` / `createDashboard` (factories), `visitQuestion` /
  `visitDashboard` / `popover` (ui), `assertTableData`
  (multiple-column-breakouts), the full notebook helper surface
  (`getNotebookStep`, `enterCustomColumnDetails`, `visualize`,
  `assertQueryBuilderRowCount`, `tableHeaderClick`, `entityPickerModal`),
  `editDashboard` / `saveDashboard` / `sidebar` / `getDashboardCard`
  (dashboard), `showDashboardCardActions` (dashboard-cards).
- New file `support/cc-boolean-functions.ts` holds only the dashboards-describe
  fixtures + `createDashboardWithQuestion` factory; it reuses
  `createMockDashboardCard` from click-behavior.ts.

## Dividends

None — clean faithful port, behaviour matches upstream on the jar.
