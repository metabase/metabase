# nulls.spec.ts (question/nulls.cy.spec.js)

Ported 5 tests (1:1 with upstream), all green on the jar (slot 5), 10/10 under
`--repeat-each=2`. tsc clean. No fixmes, no product-bug claims, so no
cross-check required.

## Fixes / classifications

Clean port — no stabilization fixes were needed. All helpers reused from shared
modules; the only new file is `support/nulls.ts` (2 tiny helpers).

Notable mechanical decisions (all known gotchas, none new):

- `cy.findByDisplayValue("13626D")` (the dashboard title, an EditableText
  `<textarea>`) → the retrying `toHaveValue` on `dashboard-name-heading` rather
  than the imperative `findByDisplayValue` scan, since it doubles as the
  page-loaded wait and needs retry.
- `cy.contains("Created At")` / `cy.contains("Cumulative sum of Discount by …")`
  → `getByText(caseSensitiveSubstring(...)).first()` (rule 1: `cy.contains` is
  case-sensitive substring, first match — NOT an exact `findByText`).
- `cy.findAllByTestId("scalar-value").should("contain","0")` (any-of set) →
  `getByTestId("scalar-value").filter({ hasText: "0" }).first()`.
- `cartesianChartCircle` length assertion → `expect.poll(count) >= 40` so it
  retries while the cumulative-sum line chart renders.

## New helpers (support/nulls.ts)

- `findGridcell(page, text)` — `cy.findByRole("grid").findByRole("gridcell",
  { name })` (exact).
- `nextCell(cell)` — jQuery `.next()` via `xpath=following-sibling::*[1]`, to hop
  from the total cell to the adjacent empty discount cell.

## Dividends

None. No Cypress-masked bugs surfaced; the port is a faithful 1:1 and passes on
the CI jar.
