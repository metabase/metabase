# models-metadata (models/models-metadata.cy.spec.js)

Ported to `tests/models-metadata.spec.ts`. New helpers in
`support/models-metadata.ts` (openColumnOptions, renameColumn, setColumnType,
mapColumnTo, startQuestionFromModel). Verified on the jar (slot 4,
COMMIT-ID 751c2a98): 9 passed, 1 skipped, and 18/18 under `--repeat-each=2`.
tsc clean.

**No product bugs and no Cypress-masked issues found.** All fixes were
port-fidelity gotchas; the one `it.skip` in the original (drills on FK columns,
upstream TODO "fix and unskip") is ported as `test.skip`, faithfully.

## Fixes, classified

1. **Known gotcha (extend the note).** `findAllByTestId("header-cell")
   .should("not.contain", "TAX")` is a *case-sensitive* substring assertion, so
   the currency header "Tax ($)" does NOT satisfy the "TAX" check upstream.
   Playwright's `filter({ hasText: "TAX" })` is case-INSENSITIVE, so "Tax ($)"
   matched and the none-of-set assertion failed. This is the same
   case-sensitivity trap as `cy.contains`/rule 1, but it applies to
   `should("contain"/"not.contain")` on a *set* too — not just single-element
   `cy.contains`. Fix: build the matcher with `caseSensitiveSubstring(text)`
   (support/text.ts) for both the contain and not-contain header helpers.

2. **New gotcha.** The model **metadata editor mounts a hidden overscan
   header-cell**: a page-global `getByTestId("header-cell")` resolves to 2
   elements where Cypress `findAllByTestId` saw 1 (the extra one is absent from
   the a11y snapshot — hidden). The "keep metadata in sync" test's
   `.should("have.length", 1).and("have.text", "TOTAL")` then hit a strict-mode
   violation. Fix: scope to the visible results table —
   `tableInteractive(page).getByTestId("header-cell").filter({ visible: true })`.
   (Adjacent to the existing rule-3 "any-of-set / .filter({visible}) " family.)

3. **Known gotcha (variant).** The metadata-editor table **re-mounts as the
   model loads**, so a `scrollIntoViewIfNeeded()` on a resolved header-cell
   throws "Element is not attached to the DOM" (this is exactly why the Cypress
   `openColumnOptions` re-queries the header cells before clicking). Fix in the
   helper: drop the explicit scroll and rely on `expect(cell).toBeVisible()`
   (re-resolves each poll) + `cell.click()` (retries actionability, auto-scrolls)
   — both tolerate a detach mid-flight.

## Notes on faithful mechanics

- Models redirect `/question/:id` → `/model/:id` and run `/api/dataset`, so
  model beforeEach blocks create via the API then `visitModel` (waits dataset).
- The question-actions "Edit metadata" item carries a completeness badge
  ("Edit metadata 89%" / "37%"), so clicks use a `menuitem` regex matcher
  (openQuestionActionsItem / getByRole name:/Edit metadata/), never an exact
  getByText — as the brief warned.
