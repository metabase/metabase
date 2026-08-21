# filters/view.cy.spec.js → tests/filters-view.spec.ts

Small spec: outer describe "scenarios > question > view" holds one nested
describe "apply filters without data permissions" with 3 `it` tests:
"show filters by search for Vendor", "filter Q by Category as no data user
(from Q link) (metabase#12654)", "filter Q by Vendor as user (from Dashboard)
(metabase#12654)". All 3 ported faithfully, all green on the jar (slot 3),
6/6 under `--repeat-each=2`. tsc clean.

## Fixes / classification
- No product bugs, no fixmes, no dividends. Clean faithful port.
- New helper module `support/filters-view.ts` (per the new-file rule):
  `grantRootCollectionViewAccess`, `applyVendorSearchFilter`,
  `applyCategoryWidgetFilter`, `expectWrittenInSql`. Imports `icon`/`popover`
  from ui.ts, `addOrUpdateDashboardCard` from dashboard-management.ts,
  `createDashboard`/`createNativeQuestion` from factories.ts — all read-only.

## Known-gotcha applications (no new gotchas)
- Rule 1: `cy.findByText(str)` → exact `getByText`; `cy.findAllByText(x).first()`
  → `getByText(exact).first()`.
- Rule 5: the "Search the list" field-filter typeahead is driven with
  `pressSequentially` (debounced value list), not `fill`.
- `cy.findAllByText("Gizmo").should("not.exist")` → `toHaveCount(0)`.
- `.test-TableInteractive-cellWrapper--firstColumn` and `.CardVisualization`
  are stable (test-prefixed / legacy) class hooks — verified rendering on the
  jar bundle, so no CSS-module-minification concern.
- `H.visitQuestion("@id")`/`H.visitDashboard("@id")` → shared `visitQuestion`/
  `visitDashboard(page, mb.api, id)`. The native question autoruns on load
  (both field-filter tags optional), so visitQuestion's query-POST wait
  resolves for the nodata user.

## Not verified
- No Cypress cross-check was needed (nothing claimed as bug/fixme). All green
  first try on the jar.
