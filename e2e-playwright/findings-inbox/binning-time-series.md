# binning-time-series

Port of `e2e/test/scenarios/binning/correctness/time-series.cy.spec.js` →
`tests/binning-time-series.spec.ts` (15 tests, one per temporal unit in
`TIME_OPTIONS`). New spec-local helpers in `support/binning-time-series.ts`
(imports `getBinningButtonForDimension` read-only from `support/binning.ts`).

**Result:** 15/15 green on the jar (slot 5, TZ=US/Pacific), 30/30 under
`--repeat-each=2`. tsc clean. No fixme / product-bug claims — every test is a
faithful pass, so no Cypress cross-check was needed.

## Fixes, classified

- **Virtualized QB results table + `cy.contains(v).scrollIntoView()` (known
  gotcha class, new concrete case).** The upstream `assertOnTableValues` does
  `cy.get("[data-testid=cell-data]").contains(v).scrollIntoView()` per value.
  Two distinct failure modes surfaced porting it against the react-window table:
  1. *Detach mid-scroll.* A resolved `cell-data` cell detaches while
     `scrollIntoViewIfNeeded` waits for stability ("Element is not attached to
     the DOM") — react-window recycles row nodes. Fix: wrap in an
     `expect(async () => …).toPass()` so the locator re-resolves each poll. This
     alone fixed 14/15.
  2. *Row below the render buffer.* "Day of month" asserts value `"30"`, which is
     never in the DOM — Playwright's viewport renders fewer rows than Cypress's,
     and Cypress's *progressive* per-value `scrollIntoView` had walked the table
     down far enough to render it. Fix: inside the same `toPass`, wheel the
     `table-scroll-container` down (300px) whenever the value's count is 0.
     Values are asserted in ascending order, so the scroll stays monotonic — no
     overshoot/return needed.

  Net helper (`assertOnTableValues`) is faithful to intent (value is present /
  scrollable-to) and build-agnostic (no CSS-module selectors; `cell-data`
  testid + `table-scroll-container` testid only).

## Dividend flag (consolidation, not a bug)

- **Virtualized-table "value is present" assertion is re-implementable.** The
  detach-retry + wheel-to-render pattern here generalizes any port of
  `cy.get("[data-testid=cell-data]").contains(v).scrollIntoView()` against the
  QB results table. Candidate for a shared `charts.ts`/table helper
  (`scrollTableValueIntoView`) if another virtualized-table correctness port
  needs it. Low priority — only one spec uses it today.
