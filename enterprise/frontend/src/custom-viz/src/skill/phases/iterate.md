# Iterate — live edits with the dev server

Executor: main agent (owns the background dev server; a subagent's
processes die with it).
Input: a change request, or none right after build. Output: edited
`src/index.tsx`, a running dev server.

Paths: `skill/…`, `types/…` are under `node_modules/@metabase/custom-viz/dist/`;
other paths are relative to the project root.

Read: `skill/references/project.md`, `skill/references/api-contract.md`,
`skill/references/sandbox-substitutes.md`, `.claude/fix-log.md`.

1. Dev server not up (Dev server checks) → `npm run dev` in the
   background, wait a few seconds, re-check. First start in this session
   → give the user the Connecting Metabase dev-mode steps.
2. One user request — one focused edit to `src/index.tsx`; saves
   hot-reload.
3. After non-trivial edits: `npm run type-check` and verify-tokens.
4. Change alters the data shape, settings or opt-outs → update the
   build statement.
5. Rename request → Renaming in `project.md`.
6. User reports a bug or quotes an error → return `misbehavior`; do not
   fix it here.

Dev server misbehaves: port busy but not answering → kill the pid,
restart, re-check. Same failure twice → read the background process
output, show the error verbatim, stop restarting.

Rules:

- Edit only `src/index.tsx` and `public/assets/icon.svg`, plus the
  files Renaming lists.
- Never silently revert edits the user made — show the diff and ask.
- An edit that undoes or rewrites code from a fix-log entry → tell the
  user which bug it may bring back, then follow the Fix log rules.
- Iterate changes are not logged.
- Never run `npm run build`.

Return: `misbehavior: <symptom>` when the user reports a bug, `done`
when the user signals done ("ship it", "looks good").
