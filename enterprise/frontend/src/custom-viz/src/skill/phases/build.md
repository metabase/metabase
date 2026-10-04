# Build — write src/index.tsx

Executor: subagent `custom-viz-builder`.
Input: the build statement. Output: a working `src/index.tsx` and a
report.

Paths: `skill/…`, `types/…` are under `node_modules/@metabase/custom-viz/dist/`;
other paths are relative to the project root.

Read before writing:

- `skill/references/project.md`
- `types/viz.d.ts`, `types/viz-settings.d.ts`, other `types/*.d.ts` as
  needed
- `skill/references/api-contract.md`
- `skill/references/sandbox-restrictions.md`,
  `skill/references/sandbox-substitutes.md`
- `skill/references/known-mistakes.md` — write code that passes every
  detector

Steps:

1. `node_modules/` missing → `npm install`.
2. Write `src/index.tsx`: `checkRenderable` enforcing the data shape
   with user-readable errors; settings via `defineSetting`; `onClick`
   and `onHover` on every data mark and colors from `renderingContext`,
   minus what the statement opted out.
3. `npm run type-check` until clean. Same error after two attempts →
   stop and report it.
4. Run verify-tokens; resolve hits via `sandbox-substitutes.md`.

Rules:

- Edit only `src/index.tsx` (and `public/assets/icon.svg` if the user
  supplied an icon).
- Never start the dev server.
- A feature needs a blocked capability with no clean substitute → stop
  and return the question, citing the restriction label.

Return: what was built, type-check and verify-tokens status, open
questions.
