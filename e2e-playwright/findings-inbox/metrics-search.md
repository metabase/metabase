# metrics-search.cy.spec.js → tests/metrics-search.spec.ts

- Size: 3 tests. All ported faithfully, all green on the jar (slot 2),
  6/6 under `--repeat-each=2`. tsc clean.
- No product bugs, no fixmes, no dividends.

## Fixes / classifications (all Known gotcha, handled by the port)

- Rule 1: `findByRole("option", { name })` and `findByText(string)` ported as
  `{ exact: true }` matches (option name, metric name, "Metric", "Apply",
  "1 result").
- Rule 2: the upstream `@dataset` / `@metricDataset` intercepts are never
  awaited by any test — dropped. The `@search` intercept ported via a
  register-before-trigger `waitForSearch` (the nav search around "View and
  filter" inside `commandPaletteSearch`, the filtered search around the Apply
  click in test 2).

## New helper

- `support/metrics-search.ts`: `commandPaletteSearch(page, query, viewAll)`
  and a local `waitForSearch`. Needed because the shared
  `search-pagination.ts` `commandPaletteSearch` hard-codes `viewAll = true`,
  but this spec exercises both branches (in-palette option click vs the
  full-page search app). Command-palette locators imported read-only from
  `command-palette.ts`; no shared files edited.

## Consolidation note (later pass)

- `commandPaletteSearch` now exists in two spec-helper modules
  (`search-pagination.ts` viewAll-only, `metrics-search.ts` viewAll-param) and
  `H.commandPaletteSearch` is a core Cypress helper. A single
  `commandPaletteSearch(page, query, viewAll = true)` belongs in
  `command-palette.ts`; `waitForSearch` likewise (duplicated in both spec
  modules). Fold both when command-palette/search helpers get consolidated.
