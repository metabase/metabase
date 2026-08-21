# dashboard-filters-matrix/page-0

Ported `e2e/test/scenarios/dashboard-filters-matrix/page-0.cy.spec.ts` →
`tests/dashboard-filters-matrix-page-0.spec.ts`.

**Result:** 20/20 pass on the jar (slot 4); 40/40 under `--repeat-each=2`. tsc clean.
No fixmes, no product-bug claims — so no Cypress cross-check was needed.

## What this spec is

A generated "matrix" page. Upstream splits one 216-case parameterised suite
(`arity × type × adminType × operator × source × results`, with the expected
widget `component` recorded per case) across 11 wrapper files
(`page-0.cy.spec.ts` … `page-10.cy.spec.ts`), each two lines calling
`runPage(N)` from `helpers/matrix-helpers.ts`, which slices the 216-entry data
array in `helpers/matrix.ts`. Page 0 = `matrix.slice(0, 20)` (all single/search).

Each test: restore + admin, set the People field's `has_field_values` admin
setting, create an Accounts question (card source) + a People question on a
dashboard with one parameter (source = connected / card / static-list), map the
param to the People column, visit, open the widget, and assert which value
component renders (`token-field` / `list-field` / `single-select-list-field`).

## Fixes / classification

All mechanical, no gotchas hit:

- `it()` → Playwright `test()` generated at collection time inside a
  `test.describe`; `test`/`expect` imported from `./fixtures` in the support
  module (tests are registered when the thin spec calls `runPage`).
- `H.restore` / `signInAsAdmin` / `cy.request PUT /api/field/:id` /
  `H.createQuestion` / `H.createDashboardWithQuestions` / `H.updateDashboardCards`
  / `H.visitDashboard` → the existing shared ports (fixtures, factories.ts,
  dashboard-core.ts, ui.ts) — nothing re-implemented.
- `H.filterWidget().contains(name).click()` → `filterWidget(page).filter({
  hasText: name }).first().click()` (Cypress `.contains` = first match).
- `should("not.exist")` → `toHaveCount(0)`; `should("be.visible")` →
  `toBeVisible()` (single-element `findByTestId`, so no any-of concern).

## MIGRATION DIVIDEND — big batch multiplier

The new `support/dashboard-filters-matrix.ts` inlines BOTH the runner machinery
AND the full 216-entry matrix data array (the family's shared resource, not a
per-page helper). Consequently **every sibling page (page-1 … page-10) is now a
thin 3-line spec** — literally `import { runPage }` + `runPage(N)` — with zero
new helper work. That is 10 more specs (~196 more test cases) portable as
copy-paste wrappers. The runner is faithful to upstream `page(n)` slicing, so the
per-page case sets stay identical to Cypress.

Recommend queueing page-1..page-10 as a trivial batch.
