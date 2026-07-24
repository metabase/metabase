# x-rays.spec.ts (dashboard/x-rays.cy.spec.js)

Ported 14 tests (12 unique + a 2-way `forEach(["X-ray","Compare to the rest"])`).
Result on the jar (slot 3): **26/26 pass, 2 skipped** under `--repeat-each=2`.
No `test.fixme`, no product-bug claims — nothing needed a Cypress cross-check.

New helper module: `support/x-rays.ts` (getDashcardByTitle, waitForDatasetResponses,
waitForDatasetWithRows, waitForXray, waitForGeojson). Everything else imported
read-only.

## Fixes classified

- **Known gotcha (rule 1) — `findByLabelText` string is EXACT.** `19405` clicks
  `cy.findByLabelText("GA")`. Ported first as `getByLabel("GA")`, which is a
  case-insensitive substring in Playwright and matched TWO elements: the
  `GA-filter-value` checkbox *and* the app-bar whose aria-label is "Navigation
  bar" ("Navi**ga**tion" contains "ga"). Fixed with `{ exact: true }`. Textbook
  rule-1 case; caught on the first jar run.

- **Counting waits, not N parallel `waitForResponse` (rule 2).**
  `cy.wait(Array(n).fill("@dataset"))` can't port to N independent
  `waitForResponse` promises — they'd all resolve on the FIRST response.
  `waitForDatasetResponses` uses one counting predicate (same shape as
  `dashboard-filters-2.ts waitForDashboardData`).

- **`waitForSatisfyingResponse` recursion → single async predicate.** `14648`'s
  recursive retry-until-body-matches loop (max-request guard) becomes
  `waitForDatasetWithRows(page, [[18760]])` — an async `waitForResponse`
  predicate that parses the body, bounded by the action timeout.

- **`cy.intercept({times}, {statusCode:500})` → a `page.route` counter.** `should
  start loading cards from top to bottom`: first `/api/dataset` request
  `route.continue()`, the rest `route.fulfill({status:500})`. Clean and
  order-independent (avoids Cypress's reverse-match `times` subtlety).

- **`getByDisplayValue` does not exist on Playwright's Locator.** `14648`'s
  `findByDisplayValue("User → Source")` inside `chartsettings-field-picker` uses
  the shared `filters-repros.findByDisplayValue` (scans input/textarea/select by
  live `inputValue()`), per the existing note in `waterfall.ts countDisplayValue`.

- **`visitQuestionAdhoc`'s `AdhocQuestion` type has no `name`.** `15737` passes
  `name: "15737"` (spread into the adhoc hash). Kept faithfully via a
  `Parameters<typeof visitQuestionAdhoc>[1]` cast rather than editing the shared
  type.

## Notes / non-findings

- The upstream `19405` carries a stale `// TODO - this is a legitimate failure
  because param_fields are not returned for x-ray dashboards` comment, but the
  test is active (no skip) upstream and **passes on the jar** — the TODO is stale.
- `13112` and `23820` assert hardcoded generated titles ("...in March 2027...",
  "...day of week...is Wednesday"). Deterministic against the fixed sample DB;
  both green including under repeat-each.
- No migration dividend surfaced — the app behaved correctly throughout.
