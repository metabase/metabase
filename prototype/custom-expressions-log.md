# Custom expressions with AI

## Brief
AI help in the custom expression editor: one code editor where people type an expression, a request in words, or an inline AI prompt, with good ergonomics for typing by hand. Guided by the CEO's requirements.

Try it: `bun run dev-prototype`, then a new question in the notebook on Prototype Data (e.g. Orders) → Custom column.

## Variants

| Version | Axis | Folders | Based on | Status |
|---|---|---|---|---|
| A | One code editor for everything; templates and functions in the side panel | see below | — | removed 2026-11-23 |
| B | Separate AI mode and code mode, switched by `=` and the `f` button | `notebook/components/InlineExpressionEditorB/`, `components/expressions/EditorB/` | A | removed 2026-11-23 |
| C | B with a `+` menu at the start of the input: the modes and code conversions | `notebook/components/InlineExpressionEditorC/`, `components/expressions/EditorC/` | B | removed 2026-11-23 |
| D | B with the prompt and the code one above the other, both on screen | `notebook/components/InlineExpressionEditorD/`, `components/expressions/EditorD/` | B | removed 2026-11-23 |
| E | B with a sparkle/f switch at the start of the input instead of the f button | `notebook/components/InlineExpressionEditorE/`, `components/expressions/EditorE/` | B | removed 2026-11-23 |
| F | E with the switch as a grey strip on the left edge of the input | `notebook/components/InlineExpressionEditorF/`, `components/expressions/EditorF/` | E | active |

Only version F is left (2026-11-23). The folders and the inline editor of A to E are deleted, and so is the switcher. F still uses A's shared code below, and A's notebook preview (`ExpressionPreview`). `InlineExpressionEditor/lazy.tsx` always loads F. The popover editors still use A's `Editor`.

Version A is the code as it was when the switcher was added (2026-11-19). It was not moved: Oleh also commits to this branch, and moving files would conflict with his work. Later versions copy the folders they change.

Version A is made of (paths under `frontend/src/metabase/querying/`):
- `expressions/` — language, suggestions, placeholders, templates, typing helpers
- `components/expressions/Editor/` — the CodeMirror editor, inline AI prompt, column hover
- `components/expressions/ExpressionSidePanel/`, `ExpressionSidebar/` — templates and functions in the right-hand panel
- `components/expressions/ExpressionWidget/` — the popover editor (filters and summaries in pickers)
- `notebook/components/InlineExpressionEditor/` — the editor on the notebook page, toolbar and preview
- `notebook/components/ClauseStep/use-inline-clause-editor.ts`, `notebook/components/NotebookStepList/CustomColumnRequest.tsx`

Version B copies the notebook editor (host only; it imports A's `ExpressionPreview`) and the `Editor` folder, plus `suggest.ts` into `EditorB/`. The switch is in `InlineExpressionEditor/lazy.tsx`, so B covers custom columns, filters and summaries in the notebook; the popover editors stay A. Figma: Custom expressions file, frames 333:18302 to 333:18964.

Version C copies B's two folders. Figma: frames 337:19006 to 337:19623.

Version D copies B's two folders. Figma: frames 337:19670, 337:19712, 337:20070, 337:20227.

Version E copies B's two folders (without B's unit spec). Figma: frame 304:15005, with the switch moved from the right of the input to the left.

Version F copies E's two folders. Figma: frame 304:14982.

### The custom column pill

Only pill B is left (2026-11-23); the switcher and the other pills are deleted. Pill A stays only in filters and summaries, without the rename hints. It was a separate switcher, **Expression pill** (`expression-pill-version`), for the style of the pill (like `Total + Subtotal`), to show that it can be renamed. Only the styling differs; the behaviour stays the same.

| Version | Axis | Folder | Based on | Status |
|---|---|---|---|---|
| A | The current pill | `notebook/components/ExpressionStep/ExpressionPill.tsx` | — | removed 2026-11-23 |
| B | Brand-blue pill; the name sits in a box like a text field: shown for a default name, and on hover or while selected | `notebook/components/ExpressionStep/ExpressionPillB.tsx` (+ `.module.css`) | A | active |
| C | Pill B in light colors: a white pill with a thin border, grey on hover and while selected; the name's box is grey | `notebook/components/ExpressionStep/ExpressionPillC.tsx` (+ `.module.css`) | B | removed 2026-11-23 |
| Hover | Pill A; the selected pill shows a light field behind the name on hover | `notebook/components/ExpressionStep/ExpressionPill.tsx` (`RENAME_HINTS`) | A | removed 2026-11-23 |
| Field | Pill A; the selected pill always shows a field with an outline behind the name; the field gets darker on hover | same | A | removed 2026-11-23 |
| Default name | Pill A; the field of Field while the name is a default one, the hover field of Hover after a rename | same | A | removed 2026-11-23 |
| Underline | Pill A; the selected pill shows a dashed underline below the name, solid on hover | same | A | removed 2026-11-23 |

Versions Hover, Field, Default name and Underline only add a hint to the selected pill A, which is the only pill that can be renamed. They apply to custom columns and custom summaries. The hint keeps the size of the pill.

Pills B and C (Figma nodes 361:2521, 361:2582) are used only in the custom column step; filters and summaries keep pill A. A new column shows "Untitled" (A: "New column"), without the unsaved dot. Names from the user or the AI drop the box; default names ("New column", shortcut names) keep it. The "+" is a 36px square: brand blue in B, white with a border in C.

## Constraints
- Enter, in order: an input method composing → its own; a text field (AI prompt, name) → its own; a highlighted suggestion → picks it; inside a function's placeholders → next placeholder; a request in words in a new column → sends it to the AI; otherwise → saves and keeps the editor open.
- A: Cmd+Enter behaves like Enter (since Oleh's d1054a7e59f).
- Tab and Enter move through a function's placeholders and a template's blanks; the last stop is after `)`.
- A template never uses made-up column names. Its blanks are named after their type: `[Text]`, `[Number]`, `[Date]`, `[Column]`; `[Number 1]`/`[Number 2]` when two different columns of a type are needed. A blank lists only columns of its type.
- A: no suggestion list shows while the text reads like a request in words.
- B: a new clause starts in AI mode; an existing one (or a draft with text) in code mode.
- B: `=` typed into an empty prompt switches to code; a pasted `=…` stays a prompt for the AI to convert.
- B: the `=` before the code is not part of the text; Backspace on empty code goes back to AI mode.
- B: `f` from code with text goes to AI mode with the code as a context pill, sent to the AI as the expression to change; `f` again returns to the same code.
- B: removing the context pill starts over: the code and the preview go.
- C: everything in B, except: the round button left of the input (`+` for AI, `=` for code) opens a menu (Ask AI, Custom expression, Convert: SQL, Python, Excel); the `=` is on that button, not before the code; the context is a full-width strip below the input, not a pill.
- C: Convert modes take code in a code font, with the placeholder "Convert SQL to custom expression"; there, a typed `=` is part of the code (Excel formulas), and the context strip doesn't show.
- C: while the AI works, the dots replace the round button and Done becomes Cancel.
- D: the AI prompt is always on screen; `f` or `=` opens the code in a grey row below it (no `=` before the code), and opens the docs side panel.
- D: there's no context pill; the code below is what a prompt asks the AI to change, also while its row is hidden.
- D: Backspace on empty code hides the code row and goes back to the prompt.
- D: a large change from the AI to a long expression shows as a diff with Accept and Reject, and the preview runs it; a small change goes in directly. A new prompt accepts the diff first. While the diff shows, f and Done do nothing.
- D: the code row has a preview button only while no preview shows, and a docs button while the docs side panel is closed.
- D: the preview is a separate card below the editor, 16px apart.
- E: everything in B, except: a segmented switch (sparkle for Ask AI, f for the code) at the start of the input replaces the f button; no "=" before the code; the prompt's placeholder is "Ask AI".
- F: everything in E, except: the switch is a 32px grey strip on the left edge, as tall as the input, with the sparkle above the f; the current mode is a white cell with a brand-colored icon (a filled sparkle for Ask AI).
- B: the "Open the docs" row is always the last row of the suggestions and never shows on its own.

## Decisions
- 2026-11-17 — The empty editor's list is headed "Suggested", not "Popular".
- 2026-11-17 — No "Generate with AI" suggestion; Enter or the AI button sends a request.
- 2026-11-19 — No argument labels (`condition:`, `output:`) inside functions; the setting for them is removed.
- 2026-11-19 — Template blanks are named after their type (see Constraints).
- 2026-11-19 — B: the AI's code goes in directly, with no Accept/Reject diff, and the preview runs. Why: matches the flow in Figma (H).
- 2026-11-19 — B: editing an existing clause opens in code mode.
- 2026-11-19 — B: no × button. Done saves and closes (an empty new clause is dropped); Escape closes once it doesn't close suggestions or leave placeholders.
- 2026-11-19 — B: Backspace after `=` on empty code returns to AI mode.
- 2026-11-19 — B: no Preview, AI or Docs buttons; the preview shows on Enter and after the AI answers, the docs open from the suggestions.
- 2026-11-19 — B: removing the context pill clears the code and the preview, to start over.
- 2026-11-19 — C: a conversion starts fresh: the current code isn't sent to the AI, and the context strip hides in the Convert modes.
- 2026-11-19 — C: Backspace on empty code goes back to Ask AI, like in B.
- 2026-11-19 — C: Python converts like SQL and Excel, but isn't tuned; it needn't work well in this prototype.
- 2026-11-19 — D: `f` with code hides only the code row; the code stays saved and is still sent to the AI.
- 2026-11-19 — D: the docs side panel opens when the user opens the code (`f` or `=`), and closes when `f` hides it; not for an existing clause or the AI's answer.
- 2026-11-19 — D: after the AI answers, the cursor stays in the prompt (cleared), and the new code shows below with the preview.
- 2026-11-19 — D: large AI changes show as a diff to accept or reject, as in A. Why: Oleh's version of the Figma (frames 304:15577, 304:15631, 304:16770) kept it.
- 2026-11-19 — D: the preview can't hide; its button in the code row shows only until the preview shows.
- 2026-11-19 — D: the docs button in the code row shows when the user closes the docs side panel.
- 2026-11-23 — Pill B follows the final design (Figma frame 373:19836): the name's box shows at all times; the pill is darker while selected, and lighter (#4181c4, no token in Figma) on hover and while renaming; a double-click renames it, and a default name like "Untitled" is a placeholder in the empty field. Filters and summaries keep their colors.
- 2026-11-23 — The preview table uses the cells of the data grid (`HeaderCellWrapper`, `HeaderCellPill`, `BodyCell`), like the design (Figma node 368:9332): 36px rows, bold 12.5px values, keys as pills, and the alignment of a table question. The header pill shows as plain text, and cells have no hover color, because the preview can't be sorted or clicked.
- 2026-11-23 — Only one prototype setting is left, `expression-hide-ai`. The others are now fixed: columns are suggested for a bare word, not only after `[`; SQL syntax gets suggested fixes; the preview picks context columns with the on-device AI, and with the title when the model isn't there.
- 2026-11-23 — The preview is a box of its own below the editor (Figma section 383:3763): "Preview" and a close button 16px below the editor, then the table in a bordered box. While no preview shows, the step's preview button (▶) shows to the right of the editor, where the steps have theirs; it runs the preview. Close hides the preview and brings the button back.
- 2026-11-23 — Editor F follows the final design (Figma frame 368:8562): a 64px editor; the mode switch is two 32px cells over the border, the current one white with a brand icon, the strip grey to the bottom; the placeholder is "Ask AI, or press = to write an expression" ("to edit the expression" with a context pill); the code has a "=" before it (back from B) and the placeholder "Write an expression"; columns are `core-blue-saturated`; the context pill is brand blue, 24px, at most 320px; while the AI works, a spinner shows before Cancel (no dots before the prompt); AI and expression errors are a warning bar below the editor, lined up with the text; text is at most 800px wide.
- 2026-11-23 — No "Suggested" list on an empty editor while the docs side panel is open: the panel already lists the functions. Typing still shows suggestions.
- 2026-11-23 — The suggestion list follows the final design (Figma frame 383:5345): functions, columns, other options and "Open docs" are separate groups with a line between them, in this order also for the keyboard (CodeMirror sections); every function has the red `f` icon; the list is 680px wide, 439px with columns only; the docs row is "Open docs" with a book icon.
- 2026-11-23 — Custom summaries use pill B in the summarize color, with the same name box and double-click rename. All summary and filter chips take the same shades as the custom column design: the base, lighter on hover, darker while selected, and the "+" darker on hover. Filters keep the core filter color (the darker shades looked too dark); only the selected pill is darker, `button-filled-filter-default`. Filters still can't be renamed, as on master. The shades are in `NotebookCell/pill-shades.ts`.
- 2026-11-23 — Keep editor F and pill B; remove the other versions, their switchers and their settings. Why: the prototype goes to the production team with one design.
- 2026-11-20 — A new custom column or custom summary can be renamed before its expression is valid. The name stays in the step's state until the first valid edit adds the clause with it. The AI does not replace a name that the user gave. A new pill (column, summary or filter) shows no unsaved dot; the dot shows only on a saved clause with an invalid edit.

## Settings
- `expression-hide-ai` — behave as without an AI provider.

## Known bugs
- None known.

## Open questions
- Should Enter in the popover editors (filters, summaries) also save?
- A suggestion list that arrives late can still catch an Enter meant to save.
- Should Enter accept an AI suggestion shown as a diff?
- Should the Save (Done) button also keep the editor open?
