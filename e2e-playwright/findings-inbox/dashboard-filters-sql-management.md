# dashboard-filters-sql-management

Ported `dashboard-filters/dashboard-filters-sql-management.cy.spec.js` →
`tests/dashboard-filters-sql-management.spec.ts` (1 test, "number filter"
describe).

## Result
- 1/1 green on the jar (slot 4), 2/2 under `--repeat-each=2`. tsc clean.

## Fixes / classification
- No fixes needed — clean first-run pass. All UI helpers reused from
  `support/dashboard.ts` (`setFilter`, `getDashboardCard`, `saveDashboard`,
  `editDashboard`, `filterWidget`, `sidebar`) + `ui.ts` (`popover`,
  `visitDashboard`). New file `support/dashboard-filters-sql-management.ts`
  holds only the `questionDetails` fixture + `setupSqlManagementDashboard`
  (create native question + dashboard, no parameter mappings — the test
  connects the tag through the UI).

## Notes (no dividends)
- The SQL `number` variable template-tag renders an INLINE number widget in
  view mode (same as sql-number), so `H.filterWidget().type("10{enter}")`
  ported to click + `pressSequentially("10")` + `press("Enter")` on the
  widget's textbox. Applying 10 filters the Orders card to 1,062 rows.
- `getDashboardCard(page).getByRole("button")` (the unmapped-filter "Select…"
  mapping button in edit mode) resolves single — no strict-mode `.first()`
  needed.
- The edit-mode filter pill label is "Number" (matched via
  `edit-dashboard-parameters-widget-container` → `getByText("Number")`),
  confirming the default number-filter name.
- Behaviour under test is real (verified on the jar): switching the operator
  from `=` to `Between` removes the mapping UI ("Column to filter on" gone —
  a range operator has no compatible target for a variable template-tag);
  switching back to `=` leaves the tag disconnected ("Tax GTE" gone); after
  save the now-unconnected filter widget disappears from view mode.
