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
- F: Enter never saves or sends. In the code it picks a highlighted suggestion, moves to the next placeholder, or starts a new line; in the AI prompt it starts a new line. Cmd+Enter (Ctrl+Enter) saves the code and keeps the editor open, or sends the prompt. An input method composing keeps both keys.
- F: the first suggestion is highlighted as the list opens, so Enter or Tab picks it.
- F: the button at the end of the editor: Cancel (subtle neutral) while the prompt and the code are empty; Run (light brand, at least 64px) while a prompt is typed or the code changed since its last run; Stop (subtle neutral), with three moving dots before it, while the AI works; Done (light brand, at least 64px) once the code has run. An opened clause starts with Done. Run does what Cmd+Enter does.
- F: the prompt stays after the AI answers. The editor goes to the code; back in AI mode, the prompt is there with the cursor at its end, and the code is the context pill. The button shows Done until the prompt is edited, then Run. Removing the context pill keeps the prompt, which can then run again (Run).
- F: in code mode only, an info button (24px subtle neutral action icon) sits 12px left of the action button. It opens the docs side panel (tooltip "Open the docs") and closes it when it's open ("Close the docs"). Clicking it keeps the focus in the code.
- Docs side panel: titled "Docs"; tabs Functions (default) and Snippets (Conditions in filters, Aggregations in summaries). A function row is the f icon in a light brand square, the name in the code font, and the description below; on hover the square turns strong brand, the name brand, the description darker. Clicking a function opens its page in the panel (back button, "Function", close): the signature, description, arguments, example and "Learn more", as in the old editor's help popover. Back returns to the list where it was scrolled. Clicking a function no longer inserts it into the code. A function the database doesn't support is greyed out; its page says so.
- Popover editors (A): Enter, in order: an input method composing → its own; a text field (AI prompt, name) → its own; a highlighted suggestion → picks it; inside a function's placeholders → next placeholder; a request in words in a new column → sends it to the AI; otherwise → saves.
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
- 2026-11-23 — Editor F follows the final design (Figma frame 368:8562): a 64px editor; the mode switch is two 32px cells over the border, the current one white with a brand icon, the strip grey to the bottom; the placeholder is "Ask AI, or press = to write an expression" ("to edit the expression" with a context pill; "press" is "type" since 2026-11-24); the code has a "=" before it (back from B) and the placeholder "Write an expression"; columns are `core-blue-saturated`; the context pill is brand blue, 24px, at most 320px; while the AI works, a spinner shows before Cancel (no dots before the prompt); AI and expression errors are a warning bar below the editor, lined up with the text; text is at most 800px wide.
- 2026-11-23 — No "Suggested" list on an empty editor while the docs side panel is open: the panel already lists the functions. Typing still shows suggestions.
- 2026-11-23 — The suggestion list follows the final design (Figma frame 383:5345): functions, columns, other options and "Open docs" are separate groups with a line between them, in this order also for the keyboard (CodeMirror sections); every function has the red `f` icon; the list is 680px wide, 439px with columns only; the docs row is "Open docs" with a book icon.
- 2026-11-23 — Custom summaries use pill B in the summarize color, with the same name box and double-click rename. All summary and filter chips take the same shades as the custom column design: the base, lighter on hover, darker while selected, and the "+" darker on hover. Filters keep the core filter color (the darker shades looked too dark); only the selected pill is darker, `button-filled-filter-default`. Filters still can't be renamed, as on master. The shades are in `NotebookCell/pill-shades.ts`.
- 2026-11-23 — The SQL hint uses the layout of the error bar (Figma node 368:9862): the bold title "Looks like SQL", then the message in 12px warning text, with no icon. The fixes (code → code, Apply), "Apply all fixes" and "Convert with AI" are below the message, in the same column; the actions are bold brand-colored text links.
- 2026-11-24 — No SQL fix for text in single quotes: custom expressions accept `'text'` and `"text"`. Why: with any other error, like two `case()` calls with nothing between them, the quote fixes made the SQL hint replace the real error. The CASE, IN, BETWEEN and `||` fixes still write their texts in double quotes.
- 2026-11-24 — F: hovering a function name in the code for 1.15s shows its reference: the help popover of master's editor (signature, description, arguments, example, "Learn more"), without its collapse toggle. Typing hides it, and it doesn't show while the suggestion list is open. Why: master showed it all the time while typing in a function, which was noisy; this works like VS Code's hover.
- 2026-11-24 — The step's preview (▶ right of the step, as on master) of a custom column, filter or summarize step shows all the step's clauses as the inline editor's preview showed one (before Roman's revert), in the data grid's cells: the columns that the clauses use (traced through custom columns), a dashed line, then the results. Custom columns: the used columns, then all the custom columns. Filters: the used columns, then one Matches/Excluded column per filter and, with two or more filters, a last "In result" column after a dashed line (✓ Included in green when the row passes all the filters, else ✗ Excluded), with rows that all the filters keep and rows that one of them removes. Summaries: the groups, the aggregations inside the expressions (like `Sum([Resolution days])` and `Count()`), then the summaries. Custom column and filter previews start with the source table's ID (a pill), as that preview did; summaries have none. Unlike that preview, there are no AI-picked context columns. The rows are a varied sample, as in that preview: of 200 rows, every distinct result when there are few, else a spread from the smallest to the largest number (one numeric result), else random rows with different results; 10 rows, and for filters 5 kept and 5 removed, each sampled by its Matches/Excluded combination. Summaries show their first 10 groups. An outdated step preview (the query changed since it ran) keeps its rows, faded, with the round ▶ of the earlier editor preview on their middle, which refreshes it; master's Refresh box replaced the rows and shifted the layout. While a refresh loads, the last rows stay, faded. A step that can't have one (like a segment filter) and the other steps keep master's preview. The editor's own preview (`ExpressionPreview`) is removed. Why: a middle ground after review: the ▶ stays in its place on the step, and the preview shows what the expressions work on, not the whole table.
- 2026-11-23 — Keep editor F and pill B; remove the other versions, their switchers and their settings. Why: the prototype goes to the production team with one design.
- 2026-11-20 — A new custom column or custom summary can be renamed before its expression is valid. The name stays in the step's state until the first valid edit adds the clause with it. The AI does not replace a name that the user gave. A new pill (column, summary or filter) shows no unsaved dot; the dot shows only on a saved clause with an invalid edit.

- 2026-11-24 — F: Enter adds a new line; Cmd+Enter saves the code or sends the prompt. Why: the CEO asked not to take over Enter, and reviewers found the single-line editor limiting for long expressions. The first suggestion is now highlighted (asked for in review), since Enter no longer saves.
- 2026-11-24 — F: the Done button changes with the state: Cancel, Run, Stop, Done (Figma frames 395:4569 to 395:4735). Why: reviewers read Done as the prompt's submit button, and it looked active when it did nothing. The loader is CSS only, from the designer; its two shades (74% and 22% of the text color) have no tokens, so it uses `icon-primary` and `border-neutral-strong`.
- 2026-11-24 — F: the AI prompt is kept after it runs, instead of being cleared. Why: reviewers wanted to see and reword the prompt that made the expression (Jacob), and the design shows it (Figma frame 395:4658).
- 2026-11-24 — F: an info button in code mode toggles the docs side panel (Figma frame 395:4735). Why: reviewers found no way to get help, especially while editing an existing expression.
- 2026-11-24 — The docs side panel is redesigned (Figma 395:5532, 395:6116, 395:6211): Functions first, each with its description, and a page per function with the old help popover's content. Why: reviewers found no function help, examples or optional arguments, and "Open docs" didn't open docs. It applies to the popover editors too, which share the panel.
- 2026-11-24 — F: the suggestion list scrolls in a Mantine ScrollArea (thin scrollbar), between the argument's description at the top and the "Open docs" row at the bottom, which both stay in place.
- 2026-11-24 — F: "Open docs" in the suggestions opens the docs panel at the page of the function the cursor is in, like `case(`; outside a function, at the list. The info button always opens the list. If the panel is already open, it switches to that page.
- 2026-11-24 — The step's preview button (▶) is back as on master: it sits right of the step's cell (centered on it, also while an inline editor is open below), and previews the whole step: every column, with all custom columns. The editor's own ▶ is removed; its "Preview" box still shows after Run or Cmd+Enter. Replaces the 2026-11-23 decision on the ▶ next to the editor.
- 2026-11-24 — F: Run, Cmd+Enter and the AI's answer open the step's preview (the master table of the whole step) instead of the editor's own preview box, which is removed. The step's preview follows the step's query while the code is unchanged since its last run, so it shows the saved expression without Refresh; after an edit it shows Refresh, as on master, until the next Run.

## Settings
- `expression-hide-ai` — behave as without an AI provider.

## Known bugs
- None known.

## Open questions
- Should the popover editors (filters, summaries) also save with Cmd+Enter instead of Enter?
- Should Enter accept an AI suggestion shown as a diff?
- Should the Save (Done) button also keep the editor open?
