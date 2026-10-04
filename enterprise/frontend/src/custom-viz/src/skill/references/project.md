# Project facts

## Files

- `src/index.tsx` — the only viz source file. Default-exported
  `CreateCustomVisualization` factory wrapped in `defineConfig`.
- `public/assets/icon.svg` — the visualization picker icon. Single-color,
  `currentColor`, so it adapts to light/dark.
- `.claude/build-statement.md` — the build statement:

  ```
  Building: <what>
  Data shape: <columns and types, expected row count>
  Settings: <list>
  Opted out: <none | drills / hover / theme>
  Notes: <click behavior, styling, other user answers that change the code; omit when none; never bug or fix history>
  ```

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
support (colors from `renderingContext`) are on unless the build
statement opts out.

## Checks

- `npm run type-check` — TypeScript, no emit.
- `node node_modules/@metabase/custom-viz/dist/skill/verify-tokens.mjs src/index.tsx`
  (verify-tokens) — scans for sandbox-blocked APIs, tags and global
  listeners; exit 1 with `file:line blocked in sandbox: <what>` per hit.
  Clean output is not proof of safety: `any`-typed values, computed
  property names and dependency code are not checked.
