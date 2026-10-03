# metrics-editing.cy.spec.js → tests/metrics-editing.spec.ts

- Size: 17 tests (4 organization, 3 data source, 3 joins, 1 custom columns,
  1 breakouts, 2 aggregations, 3 compatible metrics).
- Verified on the jar (slot 1, COMMIT-ID 751c2a98): 17/17 green, 34/34 under
  `--repeat-each=2`. tsc clean.
- New helpers: `support/metrics-editing.ts` (MetricEditor query-editor surface +
  the spec-local start*/add*/verify* functions + runButtonInOverlay). Everything
  else imported read-only (metrics.ts, notebook.ts, joins.ts, filter-bulk.ts,
  pivot-tables.ts, ui.ts). Metrics created via `mb.api.createQuestion` (the same
  path metrics-question.spec.ts uses) — it POSTs `type: "metric"` directly and
  round-trips `description`.

## Fixes classified

- **Known gotcha (rule 1 — findByText exact):** all `cy.findByText(str)` →
  `getByText(str, { exact: true })`; `cy.contains(...)` in the description test →
  case-sensitive regex (`/This is a description/`, `/with markdown/`), NOT exact
  getByText, because the rendered markdown text shares its element with siblings.
- **Known gotcha (rule 2 — response wait before trigger):** `cy.intercept().as()` +
  `cy.wait()` for POST /api/card (saveNewMetric), PUT /api/card/* (rename), POST
  /api/dataset (empty-state run), POST /api/dataset/query_metadata (custom
  aggregation) all registered before the triggering click.
- **Known gotcha (rule 3 — `.filter(":visible").should("have.length", 1)`):** the
  "metric-specific summarize step copy" test's `cy.findAllByText("Default time
  dimension").filter(":visible")` ported as `.filter({ visible: true })` +
  `toHaveCount(1)` (any-of-set count, not `.first()`).
- **Scope fix (self-inflicted, caught on jar):** the spec-local `getActionButton`
  is called both page-wide and inside `getNotebookStep("data").within(...)`. A
  page-wide port hit a strict-mode violation — "Custom column" exists in BOTH the
  data and summarize steps of a metric-based query. `getActionButton` now takes a
  `Page | Locator` scope; the "join data on the first stage" test passes the data
  step. This is exactly the scoping the Cypress `.within()` provided.

## No product-bug / fixme claims

Faithful 1:1 port; nothing surprising surfaced. No cross-check needed (no
fixme/bug asserted). Snowplow tag stubbed to no-ops per rule 6 — the two
`expectUnstructuredSnowplowEvent` assertions in "should pin new metrics
automatically" therefore do NOT verify tracking (scope caveat).

## Dividend flagged

- None. (Reuse note: `MetricEditor` here duplicates the query-editor surface
  that the Cypress `MetricPage` bundles with header/aboutPage. At consolidation,
  fold `queryEditor`/`saveButton`/`cancelButton`/`aboutTab` into the shared
  `metrics.ts` MetricPage so there's one MetricPage object.)
