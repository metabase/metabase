# custom-viz skill

You are in a Metabase custom visualization project scaffolded by
`npx @metabase/custom-viz init`. This directory
(`node_modules/@metabase/custom-viz/dist/skill/`) matches the installed SDK
version — trust it over memory of older API shapes.

## Sources of truth

Never write viz code from memory. Read when the route needs them:

- `node_modules/@metabase/custom-viz/dist/index.d.ts` and `dist/types/*.d.ts`
  — exports, props, series/column shapes, settings and widget catalog,
  click/hover objects
- `references/api-contract.md` — host behavior the types cannot express
- `references/sandbox-restrictions.md` — what fails at runtime
- `references/sandbox-substitutes.md` — what to use instead
- `references/known-mistakes.md` — symptom → cause → fix → detector

## Route the request

Check first: `node_modules/` present (else `npm install`), `src/index.tsx`
still the scaffolded thumbs-up/down template, a process on port 5174.

- Template untouched, user wants a viz → `phases/refine.md` →
  `phases/build.md` → verify ⇄ fix loop (`phases/verify.md`,
  `phases/fix.md`) → `phases/iterate.md`
- Viz misbehaves → run the verification pipeline, match the symptom in
  `references/known-mistakes.md`, apply a targeted edit
- Change request, new setting, restyle → `phases/iterate.md`
- "ship it", "package it", "build the archive" → `phases/ship.md`

## Verification pipeline

Used after build, during debug, before ship. Levels 1–2 are mechanical;
treat their errors as fact.

1. `npm run type-check`
2. `node node_modules/@metabase/custom-viz/dist/skill/verify-tokens.mjs src/index.tsx`
   — scans `src/index.tsx` and its local imports for sandbox-blocked
   APIs, tags and global listeners. Clean output is not proof of safety:
   `any`-typed values, computed property names and dependency code are
   not checked
3. Verifier subagent (`phases/verify.md`) — judgment checks; pass it the
   level 1–2 results as facts

## Roles and rules

- You (main agent): user dialog, routing, iterate/debug edits, dev
  server, packaging. Only you start the dev server — a subagent's
  background processes die with it.
- Subagents `custom-viz-builder`, `custom-viz-verifier`,
  `custom-viz-fixer` (`.claude/agents/`) each follow their phase file.
  Never give the verifier `.claude/fix-log.md` or earlier findings.
- At most 3 verify ⇄ fix rounds; blockers after round 3 → stop and tell
  the user.
- No subagent support → run the phase files inline, in order, keeping
  verification a separate pass.
- Edit only `src/index.tsx` (and `public/assets/icon.svg` when asked).
  Never edit `package.json`, `vite.config.ts`, `tsconfig.json`,
  `metabase-plugin.json` — except for renaming.
- Drills (`onClick`), hover tooltips (`onHover`) and light/dark theme are
  on by default; drop one only on explicit user request.
- Never silently revert user edits — show the diff and ask.

## Renaming

Change together: `"name"` in `metabase-plugin.json`, the `id` passed to
`defineConfig` in `src/index.tsx`, `"name"` in `package.json`, the project
directory name. Restart the dev server after.
