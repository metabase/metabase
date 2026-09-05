# dashboard-filter-defaults

Source: `e2e/test/scenarios/dashboard-filters/dashboard-filter-defaults.cy.spec.ts`
Port: `tests/dashboard-filter-defaults.spec.ts` (2 tests)
New helpers: `support/dashboard-filter-defaults.ts` (clearDefaultFilterValue, setDefaultFilterValue)

Verified on the jar (COMMIT-ID 751c2a98), slot 1: 2/2 green, 4/4 under
`--repeat-each=2`. tsc clean. No fixmes, no product-bug claims, so no Cypress
cross-check required.

## Fixes / classifications

All applied fixes were known-gotcha avoidance, no new gotchas:

- **URL search assertions retried** — `cy.location("search").should("eq", …)`
  ported as `expect.poll(() => new URL(page.url()).search)`. The default value
  is reconciled into the query string asynchronously as the sidebar edits land,
  so a one-shot check would catch a transient state (PORTING: hash/URL
  assertions Cypress retried must be `expect.poll`).
- **`H.filterWidget().contains(x)`** → `filterWidget(page, { name: x })` from
  dashboard-parameters (regex case-sensitive substring, matching Cypress
  `.contains`). `.first()` added on the editing-widget `.click()` to mirror
  `.contains`'s first-match semantics (rule 3).
- **`findByLabelText("No default")` / `findByLabelText("Input box")`** →
  `getByLabel(…, { exact: true })` (rule 1). The default-value widget trigger
  carries `aria-label="No default"` because `ParameterValueWidget` passes its
  placeholder straight through as `ariaLabel` — and keeps that label even after
  a value is set, which is why both clear and set helpers locate it identically.
- **`findByPlaceholderText("Enter some text")`** → `getByPlaceholder(…, { exact:
  true })` + `pressSequentially` for the value entry (rule 5).

## Dividends

None. Faithful 1:1 port; behaviour matches upstream on the jar.

## Reuse / consolidation note

`clearDefaultFilterValue` / `setDefaultFilterValue` are close cousins of the
default-value idioms already in `dashboard-filters-reset-clear.ts`
(`checkParameterSidebarDefaultValue`) and
`dashboard-filters-text-category.ts` (`selectDefaultValueFromPopover` /
`clickDefaultValueToggle`). Kept in a new per-agent module per the shared-file
rule; a later consolidation pass could fold the "No default" trigger locator +
the "Enter some text" / "Add filter" popover flow into
`dashboard-parameters.ts` as a shared default-value helper.
