# dashboard-filters-clear-and-restore

- **Source:** `e2e/test/scenarios/dashboard-filters/dashboard-filters-clear-and-restore.cy.spec.ts`
- **Port:** `tests/dashboard-filters-clear-and-restore.spec.ts` (1 test)
- **New helper file:** `support/dashboard-filters-clear-and-restore.ts`
- **Result:** green on the jar (slot 3), 2/2 under `--repeat-each=2`, tsc clean.

## Fixes / classification
None required — passed on the first jar run and repeat run. No fixmes, no
product-bug claims (so no Cypress cross-check needed).

## Notes
- Single-test spec covering values-source config clear/restore: a Number filter
  with a custom static list keeps that list stashed when the filter type is
  switched to Text/Category (list shows empty), and restores it when switched
  back to Number. (Not the "reset-to-default vs clear-to-empty" filter-*value*
  distinction the QUEUE blurb guessed at — it's the parameter *values source*.)
- Dropped the never-awaited `cy.intercept("POST", "/api/dataset").as("dataset")`
  (PORTING rule 2); visitDashboard/saveDashboard carry their own waits.
- Reused shared surface: `setFilter`, `setFilterListSource`, `editDashboard`,
  `saveDashboard`, `sidebar`, `selectDropdown` (dashboard.ts); `popover`,
  `modal`, `icon`, `visitDashboard` (ui.ts).
- Ported `H.checkFilterListSourceHasValue` (e2e-filter-helpers.js) into the new
  helper file — it was the one shared H helper this spec used that isn't yet on
  dashboard.ts. `cy.icon("close")` → `.first()` (Cypress first-match).

## Consolidation dividend (flag)
- `checkFilterListSourceHasValue` is the natural sibling of the existing
  `setFilterListSource`/`setFilterQuestionSource` in `support/dashboard.ts`.
  It lives in this spec's helper file only because of the no-shared-edits rule;
  fold it into dashboard.ts in a consolidation pass.
