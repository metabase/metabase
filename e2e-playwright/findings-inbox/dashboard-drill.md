# dashboard-drill.cy.spec.js → dashboard-drill.spec.ts

Source: `e2e/test/scenarios/dashboard-cards/dashboard-drill.cy.spec.js`
Verified on the jar (COMMIT-ID 751c2a98), slot 1, TZ=US/Pacific: 18 tests +
1 faithful skip; **36/36 passed under `--repeat-each=2`** (2 skipped). tsc clean.
No product bugs, no fixmes, no infra gates — this spec runs fully on the jar
harness (all sample-DB, no external DB / email / webhook).

New helpers live in `support/dashboard-drill.ts` only (spec-local factories +
small UI helpers). Shared modules imported read-only.

## Fixes classified (all "known gotcha — brief could have caught")

- **`H.sidebar()` is `cy.get("main aside")`, NOT `sidebar-right`.**
  `e2e-ui-elements-helpers.js` has both `sidebar()` (main aside) and
  `rightSidebar()` (testid sidebar-right). The click-behavior sidebar these
  tests drive is `main aside` — identical to click-behavior.ts's proven `aside`
  helper. Ported as a local `sidebar(page) = page.locator("main aside")`.
  (Known gotcha: read the H helper's body before mapping its name.)

- **Drilling via the card title clicks `legend-caption-title`, not the outer
  `legend-caption`.** Cypress `cy.findByTestId("legend-caption").contains(title)
  .click()` lands its synthetic click on the title text node; Playwright's real
  click on the filtered *outer* `legend-caption` hit a non-navigating region and
  silently stayed on the dashboard (evil fingerprint: the failure surfaces two
  steps later as "Started from Orders not found", i.e. the QB never opened).
  Fix: scope the caption by title, then click its `legend-caption-title` child
  (matches the dashboard-filters-* precedents). (Known gotcha class:
  transient/positional Cypress clicks → target the real clickable testid.)

- **`cy.findByText("Save")` after configuring a dashboard destination is the
  edit-bar Save, unscoped — not a sidebar button.** An initial port scoped it to
  `main aside` and burned the action timeout waiting for a Save that isn't there.
  Ported as `saveDashboard(page)` (waits for the PUT + query_metadata). (Rule 3
  scoping caveat: don't over-scope an intentionally-unscoped Cypress selector.)

## Notes / faithful ports (no dividend, recorded for the next porter)

- `.trigger("mousemove")` on chart paths (#15612 multi-series tooltip) →
  `triggerMousemove` (synthetic MouseEvent dispatch, wave-13 rule), asserted via
  the shared `assertEChartsTooltip`.
- `cy.intercept("POST","/api/dataset")` + `cy.wait().then(xhr =>
  expect(xhr.response.body.error)...)` → `waitForResponse` registered before the
  triggering click; error read from `await response.json()`.
- `H.echartsContainer().get("text")` and `cy.findByTestId("table-body").get(...)`
  — Cypress `.get()` resets to document root, so these are page-wide; ported as
  bare `page.locator(...)`.
- `.test-Table-ID` is a deliberately-added static class (TableInteractive.tsx),
  not a CSS-module token — safe to select on the jar (confirmed present).
- The `@skip` cross-filter test (upstream flaky, dashboard.cypress.io link
  preserved) ported as `test.skip`, body intact.
- `createNativeQuestionAndDashboard`'s augmented result carries convenience keys
  (`questionId`/`cardId`/…); stripped before passing to `editDashboardCard` so
  the PUT dashcard body stays clean (#13927).

## Consolidation candidate

- `dashboardParametersPopover` is re-implemented identically in click-behavior.ts,
  dashboard-core.ts, and filters-repros.ts — one shared home would do. (Imported
  from click-behavior.ts here; no new copy added.)
