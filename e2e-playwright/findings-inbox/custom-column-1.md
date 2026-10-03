# custom-column-1

Port of `custom-column/custom-column-1.cy.spec.js` → `tests/custom-column-1.spec.ts`.
36 tests: 35 ported+passing, 1 faithful `test.skip` (#19454, upstream `@skip`).
Verified on the jar (COMMIT-ID 751c2a98), slot 4: 35/35 green, 70/70 under
`--repeat-each=2`, tsc clean.

New helpers → `support/custom-column-1.ts` (no shared files edited):
`addCustomColumnByLabel`, `formatButton`, `pressFormatShortcut`,
`removeNotebookClauseByText`, `typeSnippet`.

## Migration dividend / new gotcha (FINDINGS-worthy)

**CodeMirror snippet-argument navigation dies under `page.keyboard.type` because
typing `[` fires close-brackets + column autocomplete — use `insertText` for the
args.** The two suggestion-snippet tests
(`coalesc{tab}[Tax]{tab}[User ID]` → `coalesce([Tax], [User ID])`) drive a CM
snippet: accepting `coalesce` inserts `coalesce(value1, value2)` with Tab-navigable
fields; each `[…]` arg is typed, and Tab advances to the next field.

Driving the arg text with `page.keyboard.type("[Tax]")` types the `[`, which
triggers CodeMirror's close-brackets (auto-inserts `]`) and the column
autocomplete. That transaction **exits the active snippet**, so the next Tab
indents instead of advancing — producing `coalesce([Tax][User ID], value2)` (the
`+` dropped, value2 never filled). Probed exhaustively: plain text (`AAA`) into a
snippet field advances fine on Tab; any `[` kills it. Enter-to-accept,
click-the-completion, Escape-then-Tab, ArrowRight-then-Tab, and a 300ms settle all
failed to advance once a bracket was typed.

Fix: `page.keyboard.insertText(arg)` inserts the literal text with **no key
events**, so neither extension fires and the snippet survives — the real Tab press
then advances the field cleanly. Function-name segments (`coalesc`) are still
real-typed (they must trigger the completion the accept-Tab consumes); only the
`[…]` args are inserted. Encapsulated in `typeSnippet` (custom-column-1.ts).

**Fidelity cross-check (done, per PORTING rule):** the original Cypress spec passes
BOTH tests on the *same* slot-4 jar backend (`MB_JETTY_PORT=4104`,
`--browser chrome`) — `cypress-real-events` realType drives the same feature
without the clash. So the app is correct and the port is faithful in outcome; this
is purely a `realType`-vs-`page.keyboard` input-method difference, not a product
bug or logic drift. Classified: **known-class gotcha extension** (PORTING rule 5,
"CodeMirror/keyboard") — reinforces that `page.keyboard.type` and realType are not
interchangeable when an editor extension reacts to individual keystrokes.

## Other notes (all standard, no findings)

- `H.enterCustomColumnDetails({ format: true })` → shared `enterCustomColumnDetails`
  + `formatExpression` (format is order-independent from naming for the asserted
  values).
- `H.visualize(cb => expect(cb.body.error))` → `visualize` returns the
  `/api/dataset` response; body `error` asserted after awaiting.
  `H.visitQuestionAdhoc(..., { callback })` drops the callback (the visible-content
  assertions that follow already fail on a query error).
- Notebook clause-pill removal (`findByText(name).icon("close")`) uses the
  inner-img pattern (button `<name> close icon` → img `close icon`), same as
  cc-literals.ts.
- `in`-filter selection-chip removal (`cy.findByText("3").next("button")`) →
  `getByText("3").locator("xpath=following-sibling::button[1]")`.
