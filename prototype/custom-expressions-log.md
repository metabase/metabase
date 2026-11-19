# Custom expressions with AI

## Brief
AI help in the custom expression editor: one code editor where people type an expression, a request in words, or an inline AI prompt, with good ergonomics for typing by hand. Guided by the CEO's requirements.

Try it: `bun run dev-prototype`, then a new question in the notebook on Prototype Data (e.g. Orders) → Custom column. Switcher: bottom of the page (beaker icon hides it).

## Variants

| Version | Axis | Folders | Based on | Status |
|---|---|---|---|---|
| A | One code editor for everything; templates and functions in the side panel | see below | — | active |

Version A is the code as it was when the switcher was added (2026-11-19). It was not moved: Oleh also commits to this branch, and moving files would conflict with his work. Later versions copy the folders they change.

Version A is made of (paths under `frontend/src/metabase/querying/`):
- `expressions/` — language, suggestions, placeholders, templates, typing helpers
- `components/expressions/Editor/` — the CodeMirror editor, inline AI prompt, column hover
- `components/expressions/ExpressionSidePanel/`, `ExpressionSidebar/` — templates and functions in the right-hand panel
- `components/expressions/ExpressionWidget/` — the popover editor (filters and summaries in pickers)
- `notebook/components/InlineExpressionEditor/` — the editor on the notebook page, toolbar and preview
- `notebook/components/ClauseStep/use-inline-clause-editor.ts`, `notebook/components/NotebookStepList/CustomColumnRequest.tsx`

## Constraints
- Enter, in order: an input method composing → its own; a text field (AI prompt, name) → its own; a highlighted suggestion → picks it; inside a function's placeholders → next placeholder; a request in words in a new column → sends it to the AI; otherwise → saves and keeps the editor open.
- Cmd+Enter shows or hides the preview, or sends a request in words to the AI.
- Tab and Enter move through a function's placeholders and a template's blanks; the last stop is after `)`.
- A template never uses made-up column names. Its blanks are named after their type: `[Text]`, `[Number]`, `[Date]`, `[Column]`; `[Number 1]`/`[Number 2]` when two different columns of a type are needed. A blank lists only columns of its type.
- No suggestion list shows while the text reads like a request in words.

## Decisions
- 2026-11-17 — The empty editor's list is headed "Suggested", not "Popular".
- 2026-11-17 — No "Generate with AI" suggestion; Enter or the AI button sends a request.
- 2026-11-19 — No argument labels (`condition:`, `output:`) inside functions; the setting for them is removed.
- 2026-11-19 — Template blanks are named after their type (see Constraints).

## Settings
- `expression-editor-version` — which version shows.
- `expression-columns-outside-brackets` — suggest columns for a bare word, not only after `[`.
- `expression-sql-fixes` — suggest the custom expression for SQL syntax.
- `expression-hide-ai` — behave as without an AI provider.
- `expression-preview-context` — context columns in the preview.

## Open questions
- Should Enter in the popover editors (filters, summaries) also save?
- A suggestion list that arrives late can still catch an Enter meant to save.
- Should Enter accept an AI suggestion shown as a diff?
- Should the Save (Done) button also keep the editor open?
