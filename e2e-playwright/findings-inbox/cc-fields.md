# cc-fields.spec.ts

Port of `custom-column/cc-fields.cy.spec.ts` (2 tests). Field resolution in
custom-column expressions — `[Column]` refs resolved case-sensitively across
case-only-differing expression names, and joined-field refs via both `→` and `.`
separators (both case variants), with the auto-formatter canonicalising all to
`[Product → Title]`.

## Result
Green on the jar (JAR_PATH, slot 1): 2/2, and 4/4 under `--repeat-each=2`.
tsc clean. No fixmes, no product-bug claims, no cross-check needed.

## Fixes / notes (all Known gotchas — no new ones)
- New file `support/cc-fields.ts` holds one helper: `addCustomColumn(page)` —
  port of `H.addCustomColumn` (`initiateAction("CustomColumn","notebook")` =
  `action-buttons .Icon-add_data` click). Uses `.first()` for the single-stage
  action-buttons row.
- Editor entry/readback reused read-only: `enterCustomColumnDetails` (notebook.ts,
  the name-aware form), `customExpressionEditorType` / `clearCustomExpressionEditor`
  / `formatExpression` / `expectCustomExpressionValue` (custom-column-3.ts).
- `→` separator: upstream `codeMirrorHelpers.type()` rewrites `→`→`->` (editor
  re-expands); `page.keyboard.type` inserts the literal `→` directly, so the
  rewrite is unnecessary and `customExpressionEditorType` types it as-is. Confirmed
  working on the jar.
- `H.createQuestion({ visitQuestion: true })` → `createQuestion` + `visitQuestion`
  (the PW factory only creates).

## Fidelity confirmation worth recording
- `getNotebookStep("expression").icon("close").should("have.length", 6)` ported
  literally to `toHaveCount(6)` and passes on the jar — 5 expression pills
  (FOO/foo/Foo/FoO + Custom) render 6 `.Icon-close` nodes. The literal count is
  correct; no adjustment made.

## Not a dividend
Nothing Cypress-masked; straight faithful port with real executable coverage.
