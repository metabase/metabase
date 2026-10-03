# filter.spec.ts (filters/filter.cy.spec.js)

Core QB filtering across column types + the custom-expression filter editor.
34 executable tests + 1 faithful `test.skip` (metabase#15333, upstream `@skip`).
Verified on the CI uberjar (COMMIT-ID 751c2a98), slot 5: 68 passed / 2 skipped
under `--repeat-each=2`. tsc clean. No product bugs found; no fixmes.

New helpers → support/filter.ts only (shared modules untouched, imported read-only).

## Fixes classified (all Known/expected porting gotchas — brief already covers them)

- **Mixed-content text nodes (rule: known gotcha).** metabase#16210's sibling
  test "highlight the correct matching": the completion label renders the
  matched prefix in its own element (`P`) with the remainder (`roduct ID`) as a
  bare text node beside it. testing-library `findByText` matches the direct
  text node, but Playwright exact `getByText` compares full `textContent`
  ("Product ID"), so `roduct ID` exact finds nothing. Ported the split-text half
  as a case-sensitive substring `.first()`; the `P` half stays exact.

- **Transient duplicate cell under CI (rule: known gotcha).** metabase#14959:
  after the filter re-runs, `wilma-muller` briefly resolves to 2 `cell-data`
  nodes (old + new table render; one in a `center-center-quadrant`). Asserted
  `.first()` on both `wilma-muller` checks (matches the transient-UI-duplicate
  guidance).

- **Open completions popup intercepts a re-focus click (new-ish detail worth
  noting).** "should offer case expression": upstream `CustomExpressionEditor.type`
  focuses via `.click("right", { force: true })`, which bypasses interception and
  dodges the completions dropdown overlaying the editor. The shared
  `focusCustomExpressionEditor` clicks the editor CENTRE with no force, so an open
  completion `<li role="option">` intercepts and the click times out. Since the
  editor is already focused there (enterCustomColumnDetails uses `blur:false`),
  passed `focus:false` — typing at the existing caret is the faithful equivalent.
  Only bites when re-typing while completions are already open; the other
  focus:true type() sites type into a fresh (popup-closed) editor.

## Port notes (mechanical, no behaviour change)

- `H.filter()` simple-mode → new `filterSimple` (qb-header-action-panel Filter,
  with the "Doing science" guard); notebook-mode reuses joins.ts `filterNotebook`.
- FK-arrow `→` in custom expressions (metabase#16198-2/-3): new
  `customExpressionType` maps `→`→`->` before delegating to the escape-aware
  typeExpression, mirroring the upstream codeMirror helper (realType can't emit
  `→`; the editor's input rule expands `->`). Both `→` tests pass, incl. the
  `allowFastSet` one (keyboard input is the faithful CDP equivalent).
- `isVisibleInPopover` custom command (metabase#14307) → new `expectVisibleInPopover`
  (bounding-box containment, padding/border-aware, same math as the original).
- `cy.wait("@dataset")` in metabase#14959 → waitForResponse registered before the
  Update click; the never-awaited `cy.intercept` in metabase#15893 dropped (rule 2).
- Duplicate upstream `it` title "…(metabase#14880)" → 2nd suffixed " (2)"
  (Playwright hard-errors on duplicate titles).
- `completion(name).parent()` (the `[role=option]` carrying aria-selected) →
  custom-column-3 `customExpressionCompletion`, which already resolves the option.

## Dividends
None — every test is a faithful port that passes on the jar. No Cypress-masked
issues surfaced; no assertions strengthened beyond faithful equivalents.
