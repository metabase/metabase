# dashboard-filters-management

Port of `dashboard-filters/dashboard-filters-management.cy.spec.js` →
`tests/dashboard-filters-management.spec.ts`. 6 tests, all green on the jar
(6/6, and 12/12 under `--repeat-each=2`), slot 2. tsc clean.

## Result

Clean port — no product bugs, no fixmes, no cross-check needed. Every fix was a
mechanical Cypress→Playwright translation, no new gotchas.

## Fixes classified (all known gotchas)

- **`findByDisplayValue` → shared `filters-repros.ts` helper wrapped in `toPass`.**
  The spec's `H.sidebar().findByDisplayValue(x).should("exist")` and
  `.click()` calls target Mantine `Select` readonly inputs. Playwright has no
  `getByDisplayValue`, and the existing `findByDisplayValue` is a one-shot scan
  that races the sidebar re-render after a type change. Wrapped it in
  `expect(...).toPass()` (`expectSidebarHasDisplayValue` /
  `clickSidebarDisplayValue`) to recover Cypress's retry semantics. No new
  helper for the scan itself — reused the shared one (matches input/textarea/
  select).
- **`findByText(label).next()` → `getByText(label, {exact:true}).locator("xpath=following-sibling::*[1]")`**
  for the "Filter or parameter type" / "Filter operator" selects. Same shape as
  the existing `setFilter` in dashboard.ts.
- **`verifyOperatorValue` uses `getByRole("textbox")`** (as the Cypress
  `findByRole` did) — dodges the duplicate-accessible-name on the Select
  wrapper per the brief's filterWidget rule.
- **`filterWidget().should("contain"/"not.contain", name)` →
  `filterWidget(page).filter({ hasText: name })` + `toBeVisible()` /
  `toHaveCount(0)`.** In view mode, a parameter with no card mappings is not
  rendered as a widget, so after "Disconnect from cards" + save the Location
  widget is gone (`toHaveCount(0)`), which is what the original asserts.

## Dividends

None. Faithful 1:1 port; behaviour matches upstream on the CI jar.

## New helpers (support/dashboard-filters-management.ts)

`selectFilter`, `changeFilterType`, `changeOperator`, `verifyOperatorValue`,
`expectSidebarHasDisplayValue`, `clickSidebarDisplayValue`,
`createDashboardWithFilterAndQuestionMapped`. All others imported read-only
(dashboard.ts, dashboard-core.ts `updateDashboardCards`, dashboard-parameters.ts
`mockParameter`, factories.ts `createDashboardWithQuestions`, filters-repros.ts
`findByDisplayValue`, ui.ts `visitDashboard`/`popover`).
