# dashboard-filters-id

Port of `dashboard-filters/dashboard-filters-id.cy.spec.js` → `tests/dashboard-filters-id.spec.ts`.

- 6 tests, all green on the jar (slot 5, COMMIT-ID 751c2a98), 12/12 under `--repeat-each=2`. tsc clean.
- No new helpers needed — everything reused read-only:
  - `editDashboard` / `filterWidget` / `saveDashboard` / `setFilter` — `support/dashboard.ts`
  - `addWidgetStringFilter` / `clickDefaultValueToggle` / `waitForDashcardQuery` — `support/dashboard-filters-text-category.ts` (the shared ports of the very field-filter helpers this Cypress spec imports)
  - `checkFilterLabelAndValue` — `support/title-drill.ts` (existing shared port)
  - `popover` / `visitDashboard` — `support/ui.ts`; `ORDERS_DASHBOARD_ID` — `support/sample-data.ts`
- No new file `support/dashboard-filters-id.ts` was created: the spec needed nothing that wasn't already ported.

## Fixes / classifications

1. **JSDoc `*/` in the header comment closed the block early** (known JS gotcha, not
   Metabase-specific). The comment described the dashcard-query route literally
   (`.../dashcard/*/card/*/query`) and the embedded `*/` terminated the block
   comment → "ReferenceError: card is not defined" at load, "No tests found".
   Reworded to avoid `*/`. Nothing to feed back to the brief beyond: never write a
   route glob containing `*/` inside a JSDoc block.

No product bugs, no fixmes, no cross-check needed (all green on the jar first try
after the comment fix). No migration dividend.

## Note (register-before-trigger)

Faithful handling of the Cypress single-`@dashboardData`-alias-waited-N-times
pattern: each `cy.wait("@dashboardData")` became a fresh `waitForDashcardQuery`
registered immediately before its triggering action (save / apply) per PORTING
rule 2. `saveDashboard` already awaits the PUT + query_metadata + dashcard-load,
so the extra dashcard-query wait around it is belt-and-suspenders but faithful.
