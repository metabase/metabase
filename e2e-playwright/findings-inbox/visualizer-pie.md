# visualizer-pie

Port of `dashboard/visualizer/pie.cy.spec.ts` → `tests/visualizer-pie.spec.ts`.

- Size: 1 test ("should allow to change viz settings"). Green on the jar (slot 4),
  1/1 first try, 2/2 under `--repeat-each=2`. tsc clean.
- **No new helpers needed.** The entire visualizer surface this spec touches
  already exists in shared modules:
  - `createDashboardWithVisualizerDashcards`, `createQuestion`,
    `createNativeQuestion`, the question fixtures, `VisualizerQuestionIds` →
    `support/visualizer-basics.ts`
  - `showDashcardVisualizerModalSettings` → `support/dashboard-card-repros.ts`
  - `editDashboard` → `support/dashboard.ts`; `modal` / `visitDashboard` →
    `support/ui.ts`
  So `support/visualizer-pie.ts` was NOT created (would have been an empty file).

## Fixes / classifications (all Known gotchas — no dividends)

- **createDashboardWithVisualizerDashcards does not visit** (unlike the Cypress
  helper, which ends in `H.visitDashboard`). Added an explicit `visitDashboard`
  after it — same pattern the drillthrough port uses. (Known: port-rule for that
  shared helper.)
- **Scoped `echartsContainer` to the modal.** The chart preview lives inside the
  visualizer modal, but the dashboard behind it (in edit mode) also renders
  `chart-container` testids, so the page-global `charts.ts echartsContainer`
  would strict-mode multi-match. Used `modal(page).getByTestId("chart-container")`
  inline. (Known: rule 3 scoping.)
- **`cy.findByText(...)` string args → `{ exact: true }`** for "Display", "200",
  "Total", "Show total"; `cy.button("Save")` → `getByRole("button", { name:
  "Save", exact: true })`. (Known: rule 1.)
- **`should("not.exist")` → `toHaveCount(0)`** for the total value/label after
  toggling "Show total" off. (Known: standard.)
- The three beforeEach intercepts (@dataset / @cardQuery / @dashcardQuery) are
  never `cy.wait()`ed in this single-test spec, so dropped. (Known: rule 2.)

No product bug / fixme, so no Cypress cross-check was required.
