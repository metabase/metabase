# Project facts

Paths: `skill/…`, `types/…`, `index.d.ts` are under
`node_modules/@metabase/custom-viz/dist/`; all other paths are relative to
the project root.

## Files

- `src/index.tsx` — the only viz source file. Default-exported
  `CreateCustomVisualization` factory wrapped in `defineConfig`.
- `public/assets/icon.svg` — the visualization picker icon. Single-color,
  `currentColor`, so it adapts to light/dark.
- Scaffold-owned, never edited except when renaming: `package.json`,
  `vite.config.ts`, `tsconfig.json`, `metabase-plugin.json`.
- Dependencies are pinned by the scaffold; none may be added.
- Unmodified scaffold: `src/index.tsx` renders a thumbs-up/down template.

## API sources

- `index.d.ts` — package exports
- `types/viz.d.ts` — component props, series/column shapes, click/hover
  objects
- `types/viz-settings.d.ts` — `defineSetting`, the widget catalog
- `types/*.d.ts` — everything else; all JSDoc-commented
- `skill/references/api-contract.md` — host behavior the types cannot
  express

## Defaults

Drill-through (`onClick`), hover tooltips (`onHover`) and light/dark theme
support (colors from `renderingContext`) are on unless the user opted out.

## Commands

- `npm install` — when `node_modules/` is missing; 60–120s on a cold cache.
- `npm run type-check` — TypeScript, no emit.
- `node node_modules/@metabase/custom-viz/dist/skill/verify-tokens.mjs src/index.tsx`
  — scans `src/index.tsx` and its local imports for sandbox-blocked APIs,
  tags and global listeners; exit 1 with `file:line blocked in sandbox:
  <what>` per hit. Clean output is not proof of safety: `any`-typed
  values, computed property names and dependency code are not checked.
- `npm run dev` — run in the background; rebuilds `dist/` on save, serves
  it at `http://localhost:5174` (setup landing page at `/`), notifies
  Metabase over SSE at `/__sse`. Rewrites `dist/` continuously.
- `npm run build` — produces `<name>-<version>.tgz` in the project root.
  Dev server must be stopped first.

## Dev server checks

```bash
lsof -ti :5174 || echo free
curl -sf http://localhost:5174/metabase-plugin.json -o /dev/null && echo up || echo down
lsof -ti :5174 | xargs kill 2>/dev/null || true   # stop
```

## Connecting Metabase

Dev mode:

1. Metabase runs with `MB_CUSTOM_VIZ_PLUGIN_DEV_MODE_ENABLED=true`.
2. Admin → Custom visualizations → Development → enable the dev server,
   URL `http://localhost:5174`.
3. Open a question matching the data shape, pick the viz in the
   visualization picker.

Packaged: Admin → Custom visualizations → Add a visualization → upload
the `.tgz`, then step 3.

## Fix log

`.claude/fix-log.md` — memory of bug fixes across rounds and sessions.
Create if missing. One entry per fix, appended:

`<fix | debug> — <symptom> → <cause> → <what changed and why>`

- Only bug fixes are logged, not feature or style changes.
- A symptom that already has an entry means the earlier fix failed —
  diagnose again and try a different approach; never re-apply the same
  edit.
- Never undo or rewrite logged code without first appending an entry that
  explains why its diagnosis was wrong.

## Renaming

Change together: `"name"` in `metabase-plugin.json`, `"name"` in
`package.json`, and `getName` in `src/index.tsx` when it returns a
display name. Never rename the project directory yourself — it is the
session's working directory; tell the user to rename it after stopping
the dev server. Restart the dev server after.
