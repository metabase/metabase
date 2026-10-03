# models/reproductions-1 (16 tests across 15 describes)

Ported `e2e/test/scenarios/models/reproductions-1.cy.spec.ts` →
`tests/models-reproductions-1.spec.ts`. New helpers in
`support/models-reproductions-1.ts` (getHeaderCell, assertColumnSelected,
countDatasetRequests, expectNoDisplayValue). Everything else imported read-only
from shared modules + `models-reproductions-2.ts` (openQuestionActionsItem,
datasetEditBar, startNewModel, waitForLoaderToBeRemoved).

Verified on the jar (slot 4, COMMIT-ID 751c2a98): 17/17 green, 34/34 under
`--repeat-each=2`. tsc clean. (17 test runs = 16 spec tests; issue 33844 has 2.)

## Fixes classified

All fixes were **known gotchas** / port-drift — no product bugs, no dividends.

1. **"Edit metadata" menu item carries a completeness badge** ("Edit metadata
   33%") — same gotcha as reproductions-2. Every Edit-metadata click uses
   `openQuestionActionsItem(page, /Edit metadata/)` (role + regex), never an
   exact getByText. (Known gotcha — the brief flagged it.)

2. **`model-column-header-content` is a DESCENDANT of `header-cell`, not an
   ancestor** (issue 29943). H's `H.tableHeaderColumn(name)` resolves the
   `<span>` name node (via `tableInteractiveHeader().findByText`), then
   `.closest("model-column-header-content")` walks UP to the wrapping Flex. But
   the shared `tableHeaderColumn` (notebook.ts) resolves the `header-cell`
   testid, and in the metadata editor the highlighted Flex sits *inside* that
   cell (`<div header-cell><Flex model-column-header-content><span>ID</span>`),
   so an ancestor-xpath found nothing. `assertColumnSelected` now locates the
   Flex directly by its exact column-name text (has-locator built from `page`,
   per the collections gotcha). (New gotcha — see below.)

3. **The QB-header model TITLE is also a `[data-testid=editable-text]`, and it's
   a non-markdown EditableText that ALWAYS renders a `<textarea>`** (issue
   34574). The description is markdown and collapses to rendered `<Markdown>` on
   blur; the title never does. The original runs its "textarea should not exist"
   assertion inside `H.sidesheet().within(...)`, so it never sees the title.
   Porting it page-wide caught the title's textarea (1, not 0). Fix: scope the
   editable-text assertions to the sidesheet locator. (Known gotcha class —
   testid collision across regions; scope to the container the original scoped
   to.)

4. **EditableText re-focuses on any non-Enter key via the root's onKeyDown**
   (`shouldPassKeyToTextarea = key !== "Enter"`, EditableText.tsx:184; onKeyDown
   calls `currentTarget.click()` → `setIsInFocus(true)`), so a synthetic Tab
   (`page.keyboard.press("Tab")`) bounces focus back into the textarea and the
   markdown never renders (issue 34574). Cypress's `realPress("Tab")` commits
   cleanly. Fix: blur the focused textarea directly
   (`page.locator("textarea:focus").blur()`) — same commit (onChange fires the
   PUT), no bounce. (New gotcha — see below.)

5. **Formik metadata fields are inputs/textareas** — column "Display name" /
   "Description" in the metadata editor are Formik `TextInput`/`FormTextarea`,
   so Cypress `should("have.text", …)` / `should("have.value", …)` port to
   `toHaveValue`, `.type()` to `fill` (+ blur), and `include.value` to
   `toHaveValue(/…/)`. (Known — the EditableText title-vs-description gotcha,
   applied to Formik fields.)

## New gotchas to fold into PORTING.md

- **`model-column-header-content` nests INSIDE `header-cell` in the model
  metadata editor.** H's `tableHeaderColumn` targets the name `<span>` so its
  `.closest("model-column-header-content")` walks up; the shared Playwright
  `tableHeaderColumn` targets the outer `header-cell`, from which the Flex is a
  *descendant*. Locate the highlighted Flex by exact column-name text, not by
  an ancestor walk from the cell.

- **`[data-testid=editable-text]` is not unique on the QB page.** The model
  title (QB header) and the description (sidesheet) both carry it. Non-markdown
  EditableText always renders a `<textarea>`; only markdown fields collapse to
  `<Markdown>` on blur. Scope editable-text assertions to the region the
  original `.within()`'d (usually the sidesheet), or a page-wide "no textarea"
  check catches the always-present title textarea.

- **Blur EditableText directly; don't Tab it.** EditableText's root onKeyDown
  re-focuses the textarea on every non-Enter key
  (`shouldPassKeyToTextarea(key) = key !== "Enter"` → `currentTarget.click()` →
  `setIsInFocus(true)`), so a synthetic `keyboard.press("Tab")` bounces focus
  back in and the markdown preview never appears. Use
  `page.locator("textarea:focus").blur()` (or the field's `.blur()`), which
  fires the same onChange/PUT without the re-focus.

## Notes / scope caveats

- Dropped never-awaited intercepts: `@fetchDatabase`, `@card`, `@metadata`,
  `@fks`, `@rootCollection` (rule 2). Kept `@dataset`/`@updateModel`/
  `@updateCard`/`@createModel` as waitForResponse promises.
- issue 43088 (instance-analytics models) is EE-token-gated
  (`test.skip(!resolveToken("pro-self-hosted"))` + activateToken); it RAN on the
  jar (token present) and passed — not skipped.
- No product-bug / fixme claims, so no Cypress cross-check was required.
