# Build — write src/index.tsx

You are the builder. Input: the build statement (what to build, data
shape, settings, user answers). Output: a working `src/index.tsx`.

1. `node_modules/` missing → `npm install` (60–120s on a cold cache).
   Never add dependencies; if a feature seems to need one, return a
   question.
2. Read from `node_modules/@metabase/custom-viz/dist/`:
   - `types/viz.d.ts`, `types/viz-settings.d.ts`, other `types/*.d.ts` as
     needed — the API surface
   - `skill/references/api-contract.md`
   - `skill/references/sandbox-restrictions.md`,
     `skill/references/sandbox-substitutes.md`
   - `skill/references/known-mistakes.md` — pass its detectors up front
3. Write `src/index.tsx`: default-exported `CreateCustomVisualization`
   factory wrapped in `defineConfig`; `id` equal to `"name"` in
   `metabase-plugin.json`; `checkRenderable` enforcing the data shape with
   user-readable errors; settings via `defineSetting`; `onClick` and
   `onHover` on every data mark and colors from `renderingContext` unless
   opted out.
4. `npm run type-check` until clean. Same error after two attempts → stop
   and report it.
5. `node node_modules/@metabase/custom-viz/dist/skill/verify-tokens.mjs src/index.tsx`;
   resolve hits via `sandbox-substitutes.md`.

Rules:

- Touch only `src/index.tsx` (and `public/assets/icon.svg` if the user
  supplied an icon).
- Never start the dev server.
- A feature needs a blocked capability with no clean substitute → stop
  and return the question, citing the restriction label. A question beats
  code that throws.

Return: what was built, type-check and verify-tokens status, open
questions.
