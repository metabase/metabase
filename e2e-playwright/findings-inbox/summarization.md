# summarization.cy.spec.js → summarization.spec.ts

Source: `e2e/test/scenarios/question/summarization.cy.spec.js`
Verified: jar mode, slot 1 (`JAR_PATH` COMMIT-ID 751c2a98). 9 passed, 1 faithful
`test.skip`. Stable under `--repeat-each=2` (18/18 non-skipped). tsc clean.

## Tests
10 total: 9 active + 1 `test.skip` (`@skip` upstream, flaky #19454 — ported
faithfully as `test.skip`).

## Fixes needed (1) — classified

- **Temporal-bucket button is hover-gated inside its column row (#13098).**
  After clicking "Number of distinct values of …", the "Temporal bucket" button
  (`data-testid="dimension-list-item-binning"`, `aria-label="Temporal bucket"`)
  lives inside the `option "Created At"` row and is hidden until the row is
  hovered. Cypress `findByLabelText("Temporal bucket").realHover()` reveals it as
  a side effect of moving the mouse over its coordinate; Playwright's `.hover()`
  refuses because the element is "not visible" until the parent row is hovered.
  Fix: hover the `getByRole("option", { name: "Created At" })` row first, then
  click the button. **Classification: known gotcha** — same hover-reveal pattern
  as PORTING rule 4 / binning.ts `getBinningButtonForDimension`; this button just
  happens to sit in the distinct-aggregation column picker rather than the
  group-by list.

## No dividends
No product bugs; the only fix was a harness hover-reveal, not an app behaviour.
No `test.fixme`, so no Cypress cross-check was required.

## New helpers → support/summarization.ts (new file, no shared edits)
- `createTestQuery(api, spec)` — POST /api/testing/query (MBQL5 test-query
  builder), returns the compiled dataset_query.
- `createCard(api, { name, dataset_query, … })` — POST /api/card with a raw
  dataset_query (factories.createQuestion can't take a pre-compiled query).
- `getRemoveDimensionButton(page, { name })` — hover row, return the
  "Remove dimension" button.
- `clickDimensionLeft(dimension)` — port of `.click({ position: "left" })` on a
  dimension row (coordinate click at x:6, mirrors binning-reproductions.ts).
- `removeMetricFromSidebar(page, metricName)` — the spec-local helper; the
  `@dataset` wait is re-registered before the close-icon click (rule 2).

## Consolidation candidates
- `createTestQuery` and the raw-`dataset_query` `createCard` are generic API
  helpers (upstream `api/createTestQuery.ts` / `api/createCard.ts`) — fold into
  `support/factories.ts` alongside `createQuestion` in a later pass. A
  `createCard` deriving dataset_query already exists privately in
  documents-core.ts; the summarization one differs by taking a pre-compiled
  query, so both should collapse into one factory that accepts either shape.
- `getRemoveDimensionButton` / `clickDimensionLeft` belong next to
  `getDimensionByName` / `getBinningButtonForDimension` — split today between
  binning.ts and nested-questions.ts. Unify the dimension-list helper surface.
