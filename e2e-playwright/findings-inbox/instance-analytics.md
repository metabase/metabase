# instance-analytics

Port of `collections/instance-analytics.cy.spec.js` → `tests/instance-analytics.spec.ts`.
11 tests, all faithful. Verified on the CI EE jar (slot 5), 22/22 green under
`--repeat-each=2`; the mirrored OSS describe (1 test) cleanly skips on the EE
jar via `isOssBackend`. tsc clean. New helpers isolated in
`support/instance-analytics.ts`.

No product bugs or migration dividends. Two fixes, both known-gotcha class (no
brief change needed) — recorded here for the metrics table:

## Fixes classified

1. **`collection-entry` row lookup (known gotcha — rule 3 / collections `has`
   pattern).** First cut iterated `getByTestId("collection-entry")` with an
   eager `count()`; that read 0 because the listing renders a beat after
   `page.goto` (Cypress `findAllByTestId` retries, we don't). Rewrote
   `openCollectionEntryMenu` to the auto-waiting
   `getByTestId("collection-entry").filter({ has: page.getByText(name, {exact}) })`
   + hover + `click({ force: true })` — the same shape as
   `collections-core.openEllipsisMenuFor`. Confirmed the `<tr>` still carries the
   bare `collection-entry` testid (`BaseItemTableRow.tsx`); the per-cell testids
   are the `-name`/`-type`/… suffixed variants.

2. **`@fieldValues` wait registered after its trigger (known gotcha — rule 2).**
   The `GET /api/field/:id/values` fires when the "Filter by this column" popover
   opens. Cypress's `cy.intercept` (registered in `beforeEach`) consumes the past
   response; a Playwright `waitForResponse` registered *after* the click misses
   it and 30s-times-out. Flaky: passed on repeat 0, failed on repeat 1. Moved the
   registration before the click. Canonical rule-2 case.

## Notes on faithfulness

- The Custom-reports `collection-menu` "Move to trash"/"Move" `not exist` checks
  are scoped to the `collection-menu` testid, matching the Cypress `.within()`.
  Those menu items render in a portal (outside the menu container), so the
  assertions are somewhat vacuous by construction — preserved as-is rather than
  "strengthened" to a portal-wide search, which would change the test's meaning.
- `findByDisplayValue("Question overview" / "Dashboard overview")` ported via the
  shared `filters-repros.findByDisplayValue` (getByDisplayValue is absent from
  this Playwright install's types) with a `page.locator("body")` scope.
- Duplicate test title "should not allow editing analytics content
  (metabase#36228)" lives in two different describes (`admin` + `API tests`), so
  the full titles differ — no Playwright duplicate-title load error.
- Audit content (Usage analytics / Custom reports collections, the pinned
  "People" audit model, "Metabase metrics" / "Person overview" dashboards,
  per-entity "Insights" links) all present and working on the EE jar — as the
  brief noted for the audit DB.
