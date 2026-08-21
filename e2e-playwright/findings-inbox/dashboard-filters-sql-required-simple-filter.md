# dashboard-filters-sql-required-simple-filter

Port of `dashboard-filters/dashboard-filters-sql-required-simple-filter.cy.spec.js`
→ `tests/dashboard-filters-sql-required-simple-filter.spec.ts` (1 test).

Verified on the jar (slot 4, COMMIT-ID 751c2a98): 1/1 green first try, 2/2 under
`--repeat-each=2`, tsc clean. No fixmes, no product-bug claims, so no Cypress
cross-check needed.

## Fixes / decisions (all Known gotchas — no new ones)

- **URL assertions → `expect.poll`.** `cy.location("search").should("eq", ...)`
  at each of the 5 flow steps ported to `expect.poll(() => new URL(page.url()).search)`
  (PORTING: hash/URL assertions Cypress retried must be poll, not one-shot).
- **Inline simple-filter widget.** The dashboard text filter (string/=) connected
  to a *simple* template tag renders as an inline text input, not a dropdown
  button — so `cy.findByDisplayValue("Bar")` (value set) and
  `cy.findByPlaceholderText("Text")` (cleared) both target that one input.
  Scoped the (unscoped-in-Cypress) `findByDisplayValue` to
  `dashboard-parameters-widget-container` where the input lives.
- **`findByDisplayValue`** imported read-only from `filters-repros.ts` (the
  install's Playwright types lack `getByDisplayValue`; this scans input/textarea/
  select via `inputValue()`).
- **`removeDefaultFilterValue`** (spec-local): `findByDisplayValue(value)
  .parent().find(".Icon-close")` ported as `findByDisplayValue(sidebar, value)`
  → `icon(control.locator(".."), "close")` — using the shared `.Icon-*` helper
  (global class, jar-safe) rather than a raw `.Icon-close` selector.
- Setup helper mirrors the number-spec precedent: create via
  `createNativeQuestionAndDashboard`, then a follow-up PUT adds the
  `parameter_mappings` (`["variable", ["template-tag", "filter"]]`) keeping the
  factory's default 11x6 layout (H.editDashboardCard merges onto the existing card).

## Dividends

None — clean faithful port, no Cypress-masked behaviour surfaced. metabase#13960
(SQL default survives reload after clearing the dashboard default) is exercised
and passes on the jar.

## Consolidation note (non-blocking)

`removeDefaultFilterValue` here vs `clearDefaultFilterValue` in
`dashboard-filter-defaults.ts` are the same shape (locate a sidebar default-value
control, click its close icon) differing only in how the control is located
("No default" aria-label vs current display value). Candidate to unify if a third
copy appears.
