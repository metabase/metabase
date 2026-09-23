# cc-shortcuts-combine

Port of `custom-column/cc-shortcuts-combine.cy.spec.ts` → `tests/cc-shortcuts-combine.spec.ts`
(6 tests, all green on the jar, 12/12 under `--repeat-each=2`, tsc clean).

New helpers: `support/cc-shortcuts-combine.ts` (`selectCombineColumns`,
`selectColumn`, `addColumn`) — the notebook expression-widget combine flow.
NB distinct from `support/column-shortcuts.ts combineColumns`, which drives the
table-header "+" Add-column modal, a different UI.

## Fixes classified

- **Separator input default value (known-gotcha variant, wave-12 caret-at-0).**
  `cy.findByLabelText("Separator").type("__")` ported first as `pressSequentially("__")`
  yielded `"__ "` — the Separator input carries a default `" "` for number
  columns, and `pressSequentially` inserts at caret position 0, leaving the
  space trailing. Cypress's `.type` replaced the field content (its asserted
  outcome is separator `"__"`, no space). Ported as `.fill("__")` (clear + set),
  which reproduces the replace end-state and fires the input event the debounced
  `combine-example` reads. This is the wave-12 "`.type()` caret at position 0"
  gotcha showing up on a pre-filled input; `fill` is the right tool when the
  Cypress outcome is a full replace.

## Dividends

None. No product-bug or Cypress-masked-issue findings — the port is a
straight, faithful UI exercise. No `test.fixme`.

## Notes

- Snowplow-tagged describe (`resetSnowplow` / `expectNoBadSnowplowEvents` /
  `expectUnstructuredSnowplowEvent`) → no-op stubs (rule 6); the final test
  still exercises the full combine UI, only the event assertion is stubbed.
- `H.openOrdersTable({ mode: "notebook" })` (no limit) → shared
  `joins.openTableNotebook`; the one limit:5 test → `custom-column.openTableNotebookWithLimit`.
- `H.CustomExpressionEditor.value().should("equal", …)` → shared
  `custom-column-3.expectCustomExpressionValue` (exact).
- `.within()` scoping preserved: `expression-name` / `combine-example` inside a
  `within(expressionEditorWidget)` block are scoped to the widget; the one
  `combine-example` assertion that Cypress ran at document root
  (add/remove test) is page-global.
