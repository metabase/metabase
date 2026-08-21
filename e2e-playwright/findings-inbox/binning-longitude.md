# binning-longitude

Port of `e2e/test/scenarios/binning/correctness/longitude.cy.spec.js` →
`tests/binning-longitude.spec.ts` (9 tests: 8 bucket widths + "Don't bin").

New helpers in `support/binning-longitude.ts` only (no shared-file edits):
`LONGITUDE_OPTIONS`, `openPopoverFromDefaultBucketSize`, `assertAxisLabels`,
`assertXAxisTicks`. Reused `chartPathWithFillColor` (binning.ts), `openPeopleTable`
(column-extract-drill.ts), `summarize` (models.ts), `popover` (ui.ts) read-only.

## Result
9/9 green on the jar (slot 4, COMMIT-ID 751c2a98), 18/18 under `--repeat-each=2`.
tsc clean. No fixmes, no product-bug claims → no Cypress cross-check needed.

## Fixes classified (all *known gotchas*, avoided in the port)
- **ECharts axis `<text>` whitespace + substring collision** (wave-11 gotcha).
  `H.echartsContainer().findByText("60° W")` is an exact whole-node match after
  testing-library normalization; a naive Playwright `getByText("60° W")` is an
  untrimmed substring that also matches `"160° W"`. Ported `assertOnXAxisTicks`
  as an exact-membership check over the normalized `<text>` set
  (`allTextContents().map(normalize)` + `.toContain`), which handles both the
  whitespace and the collision. The 20° case is the one that exercises the
  collision (`60° W` in `160° W`, `80° W` in `180° W`).
- **Hover-gated binning button** (rule 4): `openPopoverFromDefaultBucketSize`
  hovers the dimension row before the `dimension-list-item-binning` sub-button
  is clickable (upstream `realHover().within`).
- **`cell-data` `.should("contain")` is ANY-of-set** (rule 3): the "Don't bin"
  table-cell assertions are `.filter({ hasText }).first()`, preserving the
  chai-jquery any-match semantics rather than strengthening to first-match.
- **`li[aria-selected='true']` selected-dimension check**: filtered by
  "Longitude" + `.first()` (single selected item), then two `toContainText`.

## Dividends
None. Faithful port; all behaviour reproduced on the jar.
