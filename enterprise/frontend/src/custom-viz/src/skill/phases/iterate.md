# Iterate — live edits with the dev server

Executor: main agent (owns the background dev server; a subagent's
processes die with it).
Input: a change request, or none right after build. Output: edited
`src/index.tsx`, a running dev server.

Read: `.claude/build-statement.md`, `skill/references/project.md`,
`skill/references/operations.md`, `skill/references/fix-log-rules.md`
(its rules apply), `.claude/fix-log.md`.

Read on demand, before the edit that needs it:

- edit touches `onClick`, `onHover`, `renderingContext`,
  `checkRenderable` or settings → `skill/references/api-contract.md`
- edit touches the root element, hooks, hover or click handlers, popovers
  or colors → the matching `skill/references/known-mistakes.md` entries
  (Contents at the top)
- verify-tokens hit, or the request needs a browser API →
  `skill/references/sandbox-substitutes.md`

1. Dev server: Ensure running. First start in this session → give the
   user the Connecting Metabase dev-mode steps.
2. One user request — one focused edit to `src/index.tsx`; saves
   hot-reload.
3. After every edit that changes logic, markup or props (not only
   literal style values): run Checks (`project.md`).
4. Change alters the data shape, settings or opt-outs → update
   `.claude/build-statement.md`.
5. Rename request → Renaming.

Rules:

- Edit only `src/index.tsx`, `public/assets/icon.svg`,
  `.claude/build-statement.md`, `.claude/fix-log.md`, plus the files
  Renaming lists.
- User edits rules apply.
- Never run `npm run build`.

Return: `misbehavior: <symptom>` when the user reports a bug or quotes an
error — do not fix it here; `done` when the user signals done ("ship
it", "looks good").
