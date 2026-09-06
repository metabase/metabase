# cc-typing-suggestion

Port of `e2e/test/scenarios/custom-column/cc-typing-suggestion.cy.spec.js` →
`tests/cc-typing-suggestion.spec.ts`. 15 tests, all faithful, all green on the
jar (slot 5, COMMIT-ID 751c2a98). 45/45 under `--repeat-each=3`. tsc clean.
No `test.fixme`, no product-bug claims — nothing needed the Cypress cross-check.

New helpers in `support/cc-typing-suggestion.ts` (own file, shared modules
untouched; reused `focusCustomExpressionEditor`/`clearCustomExpressionEditor`/
`customExpressionCompletions`/`customExpressionCompletion`/
`expectCustomExpressionValue` from custom-column-3.ts and `customExpressionEditor`
from custom-column.ts read-only): `addCustomColumn`, `typeExpression`
(escape-aware CodeMirror type), `enterCustomColumnDetails` (escape-aware), `blurEditor`,
`helpText`, `helpTextHeader`, `acceptCompletion`, `completionsListbox`,
`verifyHelptextPosition`.

## Fixes classified

- **Known gotcha (rule 5 / editor-focus).** The shared `notebook.ts
  enterCustomColumnDetails` types the formula literally via `keyboard.type`, so
  it can't drive this spec's escape sequences (`[Rating]{leftarrow}…{backspace}t`,
  `Count{enter}`, `conca{tab}`). Needed an escape-aware `typeExpression`
  ({leftarrow}/{rightarrow}/{backspace}/{enter}/{tab} + literal text), pacing
  repeated presses at 25ms (page.keyboard has no per-command queue latency;
  CodeMirror coalesces bursts). Focus asserted before typing via the reused
  `focusCustomExpressionEditor`.

- **Known gotcha (retried assertion → expect.poll).** `verifyHelptextPosition`
  compares the help-text popover's left edge to the caret text's left edge
  (Chai closeTo 5px). The popover *slides* to the new caret, so a one-shot
  `boundingBox()` read (faithful to upstream's `.then()`) flaked once on the
  mouse-click cursor-move step under `--repeat-each=2`. Wrapped the delta in
  `expect.poll(...).toBeLessThanOrEqual(5)`. Green 45/45 after.

## Notes / no dividends

- `acceptCompletion` keeps the upstream 300ms anti-flake `waitForTimeout`
  before pressing Enter/Tab — CodeMirror doesn't register the completion popup
  immediately. Not converted to a gate; matches upstream and is stable.
- Test 1 asserts `getByTestId("expression-suggestions-list")` has count 0 — a
  literal port of upstream's `should("not.exist")`. That testid appears to be
  legacy (the live completions testid is `custom-expression-editor-suggestions`),
  so the assertion is effectively vacuous, same as upstream. Left as-is for
  fidelity; not worth flagging as a bug.
- Bracket/quote auto-close in the editor (`contains("foo"` → auto-inserted
  `)`/`"`) reproduces identically to Cypress realType, so the follow-cursor
  text-node clicks and `expectCustomExpressionValue` targets match without
  special handling.
