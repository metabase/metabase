# time-series-chrome

Source: `filters/time-series-chrome.cy.spec.ts` → `tests/time-series-chrome.spec.ts`
(4 tests). Verified on the jar (COMMIT-ID 751c2a98), slot 1, `TZ=US/Pacific`,
4/4 green, 8/8 under `--repeat-each=2`. No fixmes, no product-bug claims.

## Fixes / classifications
All fixes were known-gotcha applications — nothing new:

- `cy.findByDisplayValue` (operator/unit selects showing "All time" / "Previous"
  / "years" / "30" / "days") → shared `filters-repros.ts findByDisplayValue`
  (getByDisplayValue is missing from this install's Playwright types).
- `cy.wait("@dataset")` after Apply → a `/api/dataset` `waitForResponse`
  registered before the click (rule 2). The alias is set up by
  `visitQuestionAdhoc`.
- `cy.button("Apply")` → `getByRole("button", { name: "Apply", exact: true })`
  (findByRole string names are exact).
- IncludeCurrentSwitch is a Mantine `Switch` (role=switch input,
  `data-testid="include-current-interval-option"`, label `Include <period>`).
  Toggled with `.click({ force: true })` (rule 4). `should("not.be.checked")` /
  `should("be.checked")` → `not.toBeChecked()` / `toBeChecked()`;
  `should("have.attr","aria-checked",...)` → `toHaveAttribute` (aria-checked is
  spread onto the input, so `getByLabel(...)` resolves it — same element the
  original's findByLabelText hit).
- Single-option `should("be.visible")` on each operator → `toBeVisible()` per
  option (each is a single element, not the any-of case of rule 3).
- `should("not.exist")` on the Include switch / `getByLabel(/^Include/)` →
  `toHaveCount(0)`.

## New helper
`support/time-series-chrome.ts`: `dateFilterPicker(page)` (the reused
`date-filter-picker` testid — both the SimpleDateFilterPicker in the chrome
popover and the full DateFilterPicker from the filter-pill render it; only one
open at a time) and `updateOperator(page, from, to)` (spec-local helper: open
the operator select by its display value, pick the target option).

## Dividends
None. Faithful 1:1 port; passed cleanly on the jar on the first attempt.
