# binning-time-series-footer

Port of `binning/reproductions/34688-34690-time-series-footer.cy.spec.js` →
`tests/binning-time-series-footer.spec.ts`. 2 tests (#34688, #34690).

## Result
Green on the jar (COMMIT-ID 751c2a98), slot 1, TZ=US/Pacific:
2/2 first run, 4/4 under `--repeat-each=2`. tsc clean.

## Fixes / classification
None. Mechanical port — no stabilization needed, no fixmes, no cross-check
required (nothing failed).

- `H.createQuestion(..., { visitQuestion: true })` → `createQuestion` factory +
  `visitQuestion(page, id)`.
- `should("exist")` → `toBeVisible()` for both footer buttons.
- Spec-local breakout constants kept inline (mirrors upstream); no new helper
  file needed, so `support/binning-time-series-footer.ts` was not created and the
  helper index was left untouched.

## Dividends
None. Faithful 1:1 port of a two-assertion smoke repro.
