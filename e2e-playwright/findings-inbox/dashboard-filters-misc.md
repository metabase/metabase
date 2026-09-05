# dashboard-filters-misc

Port of `e2e/test/scenarios/dashboard-filters-2/dashboard-filters-misc.cy.spec.ts`
→ `tests/dashboard-filters-misc.spec.ts`. New helpers in
`support/dashboard-filters-misc.ts`.

## Result

- 1 test ("pivot tables › does not use extra filtering stage for pivot tables").
- Green on the jar (slot 5), first try; 2/2 under `--repeat-each=2`. tsc clean.
- No fixmes, no product-bug claims, no cross-check needed.

## Notes

- **The upstream file is no longer a grab-bag.** The brief described it as
  "miscellaneous dashboard-filter behaviours — parameter linking edge cases,
  filter ordering, auto-wiring". It was trimmed to a single pivot-tables test by
  commit `4701e5f8dc5` ("Remove querying e2e tests made redundant by backend
  test parity"). Whatever the misc file used to contain is now covered by
  backend tests; only the pivot-parameter-mapping UI test remains. Nothing was
  dropped in the port — the source is one `it`.

- **Fully reused shared surface.** `createBaseQuestions`, `createQ1Query`,
  `getFilter`, `verifyDashcardMappingOptions`, and all the `*_COLUMNS` consts
  came straight from `support/dashboard-filters-2.ts` (imported read-only). The
  only spec-unique code was the pivot query builder and a single-card
  create+visit dashboard — because the query-stages module keeps its
  `createAndVisitDashboard` and the Date/Text/Number parameter consts private.

- **Consolidation candidate (later pass):** `support/dashboard-filters-2.ts`'s
  `createAndVisitDashboard` and its `DATE/TEXT/NUMBER_PARAMETER` consts are
  private, forcing `dashboard-filters-misc.ts` to reproduce the parameter
  definitions and card-placement logic. If more query-stages specs land, export
  a card-list `createAndVisitDashboard(page, mb, cards)` (and the three
  parameter consts) from `dashboard-filters-2.ts` so single-card and matrix
  callers share one path. Low urgency — it's ~40 faithful lines.

## Mechanical port classifications (all known gotchas, no new ones)

- `cy.intercept("POST","/api/dataset/pivot").as() + cy.wait(@datasetPivot)` →
  `waitForResponse` registered before the legend-caption click, awaited after
  (rule 2). Unawaited intercepts (@dataset/@getDashboard/@cardQuery) dropped.
- `H.saveDashboard({ awaitRequest: false })` → `saveDashboard(page,
  { awaitRequest: false })` — the test changes no mappings, so no PUT fires
  (known gotcha).
- `findByTestId("loading-indicator").should("not.exist")` → `toHaveCount(0)`.
- `cy.button(/Filter/)` regex → `getByRole("button", { name: /Filter/ })`.
- `H.popover().findByText("Summaries").should("not.exist")` → exact-text
  (rule 1) `toHaveCount(0)`.
