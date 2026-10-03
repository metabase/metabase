# models/reproductions.cy.spec.js → tests/models-reproductions.spec.ts

Grab-bag of model bug repros. 13 tests across 11 describes (issues 19737 ×2,
22519, 23024, 23421 ×2, 23449, 25537, 29378, 29517, 53556, 40252, 42355).

**Result on the jar (slot 1, COMMIT-ID 751c2a98):** 12 passed, 1 skipped;
12/12 (minus skip) stable under `--repeat-each=2` (24 passed, 2 skipped). tsc clean.

## Skips (faithful)
- **issue 22519** is upstream `{ tags: "@skip" }` → `test.describe.skip`. Ported
  faithfully but never runs. Its `REVIEWS.REVIEWS` field-id reference is not a
  real key in `cypress_sample_database.json` (a latent upstream typo, harmless
  because skipped); cast `SAMPLE_DATABASE.REVIEWS as Record<string, number>` to
  keep tsc happy without altering the reference.

## Fixes classified (all Known gotchas — no product bugs, no dividends)
- **"Switch to data" footer toggle → `click({ force: true })`.** The footer
  SVG toggle reads as "element is not enabled" to Playwright's actionability
  (it's an aria-labelled icon, not a form control). This is the established
  pattern across pie-chart / smartscalar-trend / timelines-question / scatter —
  the initial `.click()` timed out; forced click is correct. (issue 53556)
- **`H.openQuestionActions(); popover().findByText("Edit metadata")` →
  `openQuestionActionsItem(page, /Edit metadata/)`.** The app appends a
  completeness badge ("Edit metadata 33%"); testing-library's exact `findByText`
  matched the label's own text node so Cypress worked, but Playwright's exact
  `getByText` compares full element text and never hits it. Reused the
  role-based helper introduced by the reproductions-2 port. (issues 40252, 42355)

## No cross-check needed
No `test.fixme` and no product-bug/environmental claims — every test passed on
the jar. Nothing rests on "Cypress fails identically".

## New helpers
`support/models-reproductions.ts` (new file): `mapModelColumnToDatabase`,
`selectModelColumn` — the two module-level closures the Cypress spec defines
outside its describes (used by the model-column-mapping repros 29517 & 53556).
Describe-scoped closures (moveModel/openEllipsisMenuFor for 19737, the local
turnIntoModel for 23449) stay inline, mirroring the original structure.

## Consolidation candidate
`support/models-reproductions.ts` (2 helpers) should fold into `models.ts` on
the next consolidation pass, alongside the `models-reproductions-2.ts` fold-in
already flagged there.

## Data-derived assertions (watch on CI)
issue 53556 pins exact binned values and a row count of 312 (`"140  –  160"`,
`"January 2027"`, etc.). These passed on the local jar (751c2a98). Per the
"stale local jar" gotcha, if CI's freshly-built jar carries different sample
data these could skew — but unlike smartscalar's month-span clamp, these are
straight breakout values, so lower risk. Ported faithfully.
