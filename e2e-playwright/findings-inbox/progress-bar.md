# progress-bar.spec.ts (visualizations-charts/progress-bar.cy.spec.js)

Ported 7/7 tests, all green on the jar (slot 4, COMMIT-ID 751c2a98),
12/12 under `--repeat-each=2`. tsc clean.

## Fixes classified

- **Known gotcha (rule: `should("exist")` ≠ `.toBeVisible()`).** Two tests
  (`exclude value column…`, `switching between custom value and column
  reference`) assert the *selected goal column name* with Cypress
  `cy.findByText(col).should("exist")`. The progress-bar goal setting renders
  the chosen column's name in a **hidden** element (a read-only display span
  behind the Select), so `toBeVisible()` fails while the node is plainly in the
  DOM. Faithful port is `toBeAttached()` (existence). Initial port used
  `toBeVisible()` and red-flagged only these two — caught and corrected without
  a fixme. No product bug: the visible control is the Select input; the hidden
  span is just where the label text lives.
- **Async Select re-render.** After picking a new value-field option, the
  Mantine Select re-renders a beat later; the `findByDisplayValue("Sum of
  Total").should("be.visible")` re-check is wrapped in `expect.poll` so it
  doesn't catch the pre-update value. (Standard, not a new gotcha.)

## Notes / non-issues

- `SAMPLE_DATABASE.id` is regenerated at Cypress start and is **absent from the
  committed fixture JSON** (only `ORDERS_ID`/field ids are present) → used
  `SAMPLE_DB_ID` (1) for the native-query database. Worth noting for any future
  port that reaches for `SAMPLE_DATABASE.id`.
- The `18,760` / `Goal 0` / `Goal exceeded` / `Goal 100,000` labels are
  progress-bar **DOM** text (not SVG/canvas), so no Chromium-vs-Chrome
  text-metrics gotcha — no fixme/cross-check needed.

## New helper

- `support/progress-bar.ts` — `goalColumnDropdown(sidebar)` (the
  `findByText("Goal").parent().parent().icon("chevrondown")` chevron, used 3×).

## Dividends

None (no product bug; no Cypress-masked issue surfaced).
