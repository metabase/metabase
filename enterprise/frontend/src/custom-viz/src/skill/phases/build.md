# Build — write src/index.tsx

Executor: subagent `custom-viz-builder`. As a subagent, follow only this
file; ignore AGENTS.md and the orchestrator README.
Input: none; reads `.claude/build-statement.md`. Output: a working
`src/index.tsx` and a report.

Read before writing:

- `.claude/build-statement.md`
- `skill/references/project.md`
- `types/viz.d.ts`, `types/viz-settings.d.ts`, other `types/*.d.ts` as
  needed
- `skill/references/api-contract.md`
- `skill/references/sandbox-restrictions.md`,
  `skill/references/sandbox-substitutes.md`
- `skill/references/known-mistakes.md` — write code that passes every
  detector

Steps:

1. Write `src/index.tsx`: `checkRenderable` enforcing the data shape
   with user-readable errors; settings via `defineSetting`; the
   `project.md` Defaults on every data mark, minus what the statement
   opted out; everything in Notes.
2. Re-read `src/index.tsx` against every `known-mistakes.md` detector;
   fix what fails.
3. Run Checks (`project.md`).

Rules:

- Edit only `src/index.tsx`.
- No comments that explain a fix or argue the code is correct.
- Never start the dev server.
- A feature needs a blocked capability with no clean substitute → stop
  and return the question, citing the restriction label.
- Use only packages in `package.json`. A library would clearly help →
  return it as an open question (`project.md`, Libraries).

Return: what was built, Checks status, open questions.
