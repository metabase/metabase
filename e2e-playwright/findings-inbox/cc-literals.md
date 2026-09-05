# cc-literals

Port of `custom-column/cc-literals.cy.spec.ts` → `tests/cc-literals.spec.ts`
(3 tests, all green on the jar, 6/6 under `--repeat-each=2`). New helpers in
`support/cc-literals.ts` (addCustomColumns / removeTableFields /
testFilterLiteral); everything else imported read-only. No product bugs; no
`test.fixme`.

## New gotcha (fix pattern) — a notebook filter-clause pill is ONE button whose centre reopens the editor

Removing a filter clause in the notebook is `H.getNotebookStep("filter")
.findByText(name).icon("close").click()` upstream — i.e. click the `.Icon-close`
SVG *inside* the pill. The pill renders as a single
`role="button"` with accessible name `"<displayName> close icon"`, whose layout
is `[ text "<displayName>" ][ img "close icon" ]`. Two traps:

1. `getNotebookStep("filter").locator(".Icon-close")` is a **strict-mode
   violation** — it also matches the step-level "Remove step" icon (aria-label
   "Remove step"). (Rule 3: scope it.)
2. Scoping to the pill button and clicking *it* —
   `getByRole("button", { name: "<name> close icon" }).click()` — clicks the
   button **centre**, which sits over the clause text, so it **reopens the
   expression editor** instead of removing the clause. The clause survives, the
   filter step stays, and the failure surfaces two iterations later as
   "expression step has no Filter button" (once a filter step exists, the
   expression step stops offering the Filter action). Evil fingerprint: the
   remove click "ran" (Playwright logs it), and the timeout blames an unrelated
   locator on the next loop iteration.

Fix — click the close icon itself, scoped to the pill:
```ts
await getNotebookStep(page, "filter")
  .getByRole("button", { name: `${filterDisplayName} close icon`, exact: true })
  .getByRole("img", { name: "close icon", exact: true })
  .click();
```
General rule: when a Cypress `.icon("close")` targets an X *inside* a
text-bearing pill/button, port it as a click on the icon element, never on the
enclosing button — the button centre is usually the pill's open/select target.

## Non-finding — Escape closing the reopened editor works fine

Initially suspected the wave-9 parked-mouse-tooltip gotcha (the reopened
Cancel/Update editor dialog staying open after `cy.realPress("Escape")` →
`page.keyboard.press("Escape")`). The trace disproved it: every Escape closed
its dialog; the stuck-open dialog was caused by trap 2 above (the remove click
reopening it), not by a tooltip eating the Escape. No park-mouse needed here.

## Notes on faithful ports reused

- CodeMirror auto-close-pair overtyping makes the shared `enterCustomColumnDetails`
  round-trip `"abc"`, `[Number]`, `[Number] + [Number]` etc. correctly (typing
  the closing `"`/`]` overtypes the auto-inserted one), matching upstream.
- `H.openProductsTable({ mode: "notebook" })` → `openTableNotebook(page, PRODUCTS_ID)`.
- `H.assertTableData` → `multiple-column-breakouts.ts assertTableData` (page-level).
