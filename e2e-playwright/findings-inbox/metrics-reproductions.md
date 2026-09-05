# metrics-reproductions

Source: `e2e/test/scenarios/metrics/reproductions/metrics-reproductions.cy.spec.ts`
Port: `tests/metrics-reproductions.spec.ts` (3 tests, 3 issue repros)

## Result
3/3 green on the jar (slot 3), 6/6 under `--repeat-each=2`. tsc clean.
No fixmes, no product-bug claims. All three issue numbers preserved
(#47058, #44171, #32037).

## Fixes classified (all known gotchas — port avoided the traps)
- **#47058 loading intercept**: Cypress delays `GET /api/card/:id/query_metadata`
  by 1s via `req.continue(() => new Promise(setTimeout))`. Ported as
  `page.route` with a `setTimeout` delay + a `waitForResponse` registered before
  `goto` to gate the "loading gone" assertions (PORTING rule 2 — register before
  the triggering navigation). New helper `delayQueryMetadata` /
  `waitForQueryMetadata` in `support/metrics-reproductions.ts`.
- **#47058 `.should("not.exist")`** → `toHaveCount(0)`; `.should("be.visible")`
  → `toBeVisible()`. The `[Unknown Metric]` non-existence assertion (the actual
  bug being repro'd — no flash of unknown-metric text) holds both before and
  after metadata resolves.
- **#44171 async card-add pacing**: after clicking a metric in the questions
  sidebar, anchored on `expect(getDashboardCards).toHaveCount(1)` before hovering
  the card (the saveDashboard / card-add pacing gotcha). Reused
  `showDashcardVisualizerModal(page, 0, { isVisualizerCard: false })` for the
  `showDashboardCardActions` + `getDashboardCard.findByLabelText("Visualize
  another way").click()` pair.
- **#32037 retried location check** → `expect.poll(() => new URL(page.url())
  .pathname).toBe(...)` (PORTING: Cypress `cy.location().should` → `expect.poll`).

## Consolidated helpers reused (no re-implementation)
- `mb.api.createQuestion` / `mb.api.createDashboard` (metric + question + dashboard
  fixtures — matches the established metrics-* ports).
- `MetricEditor` (queryEditor/saveButton/aboutTab) from `metrics-editing.ts`;
  `MetricPage.aboutPage` from `metrics.ts`.
- `chartLegendItem` from `metrics-dashboard.ts`; visualizer surface
  (`openQuestionsSidebar`, `switchToAddMoreData`, `selectDataset`,
  `showDashcardVisualizerModal`) from `visualizer-basics.ts`.
- `getNotebookStep` (notebook.ts), `editDashboard`/`sidebar`/`getDashboardCard`
  (dashboard.ts), `getDashboardCards` (dashboard-core.ts), `modal`/`popover`/
  `visitDashboard` (ui.ts).

## New helper file
`support/metrics-reproductions.ts` — only `main` (page `<main>` region, used by
#47058) and the two query_metadata route/wait helpers. No shared files edited.

## Dividends
None. All three repros behave correctly on the jar; the ports verify the fixed
behaviour rather than exposing a bug.
