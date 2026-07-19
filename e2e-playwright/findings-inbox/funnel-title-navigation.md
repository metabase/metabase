# funnel-title-navigation

Source: `dashboard/visualizer/funnel-title-navigation.cy.spec.ts`
Target: `tests/funnel-title-navigation.spec.ts`
New helper file: `support/funnel-title-navigation.ts`

## Result

1 test, green on the jar (slot 2), 2/2 under `--repeat-each=2`. tsc clean for
these files.

## Fixes / classification

- **Known gotcha (rule 2):** `cy.intercept + cy.wait("@dashcardQuery")` →
  `page.waitForResponse` registered before `visitDashboard`, awaited after.
- **Known gotcha (retried location assertion):** `cy.location("pathname")
  .should("contain", ...)` → `expect.poll(() => new URL(page.url()).pathname)
  .toContain(...)`, since the title-drill navigation is client-side (mirrors
  title-drill.spec.ts).
- **Known gotcha:** `findByTestId("funnel-chart").should("exist")` → `toBeAttached()`.

No new gotchas. No product-bug / fixme claims — the test passed clean, so no
Cypress cross-check was needed.

## Dividends

None. Straightforward single-test port; all UI helpers (`clickOnCardTitle`,
`getDashboardCard`, `visitDashboard`) and factories (`createNativeQuestion`,
`createDashboard`) already existed. Only the spec-specific visualizer-funnel
dashcard setup is new, factored into `createFunnelVisualizerDashboard`.
