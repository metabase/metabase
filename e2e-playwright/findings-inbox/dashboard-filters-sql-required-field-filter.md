# dashboard-filters-sql-required-field-filter

Source: `dashboard-filters/dashboard-filters-sql-required-field-filter.cy.spec.js`
Target: `tests/dashboard-filters-sql-required-field-filter.spec.ts`
Helper: `support/dashboard-filters-sql-required-field-filter.ts` (new)

## Result

1 test, green on the jar (slot 5, COMMIT-ID 751c2a98). Passed first run and
2/2 under `--repeat-each=2`. tsc clean. No fidelity cross-check needed — no
fixme/bug claim.

## Fixes / porting decisions (all known gotchas, nothing new)

- **Setup extracted to a helper** mirroring the Cypress inline
  `H.createNativeQuestionAndDashboard` + `H.editDashboardCard`. Reused the
  consolidated `createNativeQuestionAndDashboard` factory. `editDashboardCard`
  was ported inline in the helper: GET the dashboard, drop `created_at`/
  `updated_at` from the existing dashcard, re-PUT it with the merged
  `parameter_mappings` (`target: ["dimension", ["template-tag", "filter"]]`).
- **immer `produce` dropped** — the required variant of the template-tag is
  written directly (`required: true`) instead of pulling in immer; only the
  required form is used by the spec.
- **`cy.location("search").should("eq", ...)` → `expect.poll(() => new
  URL(page.url()).search)`** (PORTING: retried URL checks, one-shot misses
  transient states). Four such checks.
- **`cy.findByTestId("dashcard").contains(t)` / `H.filterWidget().contains(t)`
  → `toContainText`** on the single dashcard / `filterWidget(page).first()`
  (Cypress `.contains` = first-match presence).
- **`clearFilterWidget`** imported from `dashboard-parameters.ts` (hover-gated
  close icon) — read-only reuse.
- **Final unscoped `cy.findByText("Required Filters Dashboard")` (findBy =
  exact) → `getByText(name, { exact: true })`** on the collection-root listing.

## Dividends

None. Straightforward faithful port; behaviour (required field-filter default
fallback, metabase#13960 cleared-state persistence) reproduces exactly on the
jar.
