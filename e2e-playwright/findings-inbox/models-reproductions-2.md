# models/reproductions-2 (15 tests across 15 describes)

Ported `e2e/test/scenarios/models/reproductions-2.cy.spec.ts` →
`tests/models-reproductions-2.spec.ts`. New helpers in
`support/models-reproductions-2.ts` (main, waitForLoaderToBeRemoved,
datasetEditBar, saveMetadataChanges, runButtonInOverlay, startNewModel,
startNewNativeModel, visitModelNoDataAccess, openQuestionActionsItem).

Verified on the jar (slot 1, COMMIT-ID 751c2a98): 16/16 green, 32/32 under
`--repeat-each=2`. tsc clean.

## Fixes classified

All fixes were **known gotchas** / port-drift — no product bugs, no dividends.

1. **"Edit metadata" menu item carries a completeness badge** ("Edit metadata
   33%"). The shared `openQuestionActions(page, action)` matches the popover
   item by EXACT text, which never hits that node — 5 tests failed identically
   (20624, 37300, 32037-metadata, 51925, 57557), while every "Edit query
   definition" call passed (no badge). Added a local `openQuestionActionsItem`
   that clicks the item by `getByRole("menuitem", { name: /regex/ })` instead.
   This is a variant of the existing rule-1 caveat and worth a one-liner: any
   port that opens "Edit metadata" via the shared exact-text helper will fail
   on models whose metadata isn't 100% complete.

2. **Mantine Autocomplete comboboxes (link_text/link_url, issue 51925): fill()
   leaves the dropdown open and swallows the next column switch.** After
   `fill()`-ing a column's link settings, clicking the next column header did
   not switch the sidebar — the third "User ID" click read Product ID's values.
   Cypress typed (`.type(..., { parseSpecialCharSequences: false })`) and its
   command-queue latency let the dropdown settle. Fix: click +
   `pressSequentially` + `blur()` per input (real keystrokes commit the value
   and the blur closes the dropdown). Reinforces rule 5 (autocomplete widgets
   need real keystrokes, not fill). **Fidelity cross-check confirmed** the app
   is correct: the Cypress original passes on the same slot-1 jar backend, so
   this was port drift, not a #51925 regression.

3. **`getByRole("link", { name: "Product 6" })` is a substring match** and hit
   "Product 60"/"User 10". Cypress `findByRole` name strings are exact →
   added `{ exact: true }` (rule 1).

## Port notes

- `H.createQuestion`/`H.createNativeQuestion({ type: "model" }, { visitQuestion:
  true })`: the /question/:id → /model/:id redirect runs /api/dataset, so those
  beforeEach blocks API-create then `visitModel` (not `visitQuestion`).
- issue 56698 signs in as **"readonlynosql"** — outside the typed `USERS` map
  but present in the login cache — via `signInWithCachedSession(context, ...)`.
  Everything after is UI-driven, so the api sessionId isn't needed.
- issue 57557 uses the `hasDataAccess: false` variant of visitModel (waits
  POST /api/card/:id/query, not /api/dataset) — the "nodata" user runs the
  native model through the card endpoint. Ported as local
  `visitModelNoDataAccess`.
- 69722's `NativeEditor.type("{enter}".repeat(20))` → focus + 20×
  `keyboard.press("Enter")`.
