# dashboard-filters-auto-apply

Source: `dashboard-filters/dashboard-filters-auto-apply.cy.spec.js` → `tests/dashboard-filters-auto-apply.spec.ts`
New helpers: `support/dashboard-filters-auto-apply.ts`
Verified: jar (slot 3, COMMIT-ID 751c2a98), 14/14 first try; 28/28 under `--repeat-each=2`. No `test.fixme`, no product-bug claims.

## Fixes classified (all *known gotcha* — handled at port time, brief was sufficient)

- **rule 2 (register-before-trigger):** the `@cardQuery` alias is 3 distinct
  endpoints — app `POST /api/dashboard/:id/dashcard/:id/card/:id/query`, public
  `GET /api/public/...`, embed `GET /api/embed/...`. One `waitFor*CardQuery`
  helper each, registered before the action.
- **rule 4 (Mantine Switch):** the auto-apply toggle is clicked as the
  `getByLabel("Auto-apply filters")` role=switch input with `{ force: true }`;
  `toBeChecked()` reads the same input.
- **`should("not.be.checked")` on a text node:** upstream's
  `findByText("Gadget").should("not.be.checked")` targets a `<span>`, which is
  vacuous under jQuery and would *throw* under Playwright's toBeChecked (not a
  checkable subject). Ported via `expectFilterSelected(popover, "Gadget", false)`
  — resolves the option's checkbox by its label. Faithful to intent, and
  actually enforces.
- **`cy.clock()`/`cy.tick(TOAST_TIMEOUT)`:** the two "should not show toast"
  tests port cleanly to `page.clock.install()` (before nav) + `runFor`. Despite
  the wave-12 warning that `page.clock` doesn't freeze time, these are
  wide-margin *negative* assertions (undo toast absent), so the difference
  doesn't bite. Both pass on the jar, repeatably.
- **spy call-count without cy.request contamination:** upstream's
  `updateDashboardSpy` (PUT /api/dashboard/*) asserts callCount 3 / 1. The port's
  `create*` helpers PUT via `mb.api` (request context), not the browser page, so
  `countRequests(page, ...)` naturally counts only the UI toggles — same numbers,
  same reason the Cypress spy skips its cy.request creation PUTs.
- **`cy.get("@cardQuery.all").should("have.length", n)`:** where upstream had no
  explicit `cy.wait`, polled a `countRequests(isDashcardQueryRequest)` counter;
  the preceding `assertCardRowsCount` already blocks on the re-query rendering.

## Consolidation candidates (dividends — tidiness, not bugs)

- **`applyFilterToast` / `applyFilterButton` / `cancelFilterButton`:**
  `dashboard-parameters.ts` already exports a Page-only `applyFilterButton`; the
  new module adds scope-taking (`Page | FrameLocator | Locator`) versions of all
  three so the full-app-embedding test can pass the iframe. At consolidation,
  fold the scope-taking trio into a shared module and drop the Page-only copy.
- **`assertCardRowsCount(card, value)`** duplicates the private
  `assertCardTableRowsCount` in `dashboard-filters-2.ts` (only exposed there via
  the Page-only `assertDashcardRowsCount`). A shared card-Locator-taking
  `assertCardRowsCount` would serve both.
