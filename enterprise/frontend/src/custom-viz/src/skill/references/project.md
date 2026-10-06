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
  Opted out: <none | drills / hover>
  Colors: <theme | own: <per mark color: base, hover, light/dark variants, dark-theme value>>
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

Drill-through (`onClick`) and hover tooltips (`onHover`) are on unless
the build statement opts out. Colors follow the statement's `Colors`
(`api-contract.md`, Colors); both light and dark themes must read well
either way.

## Checks

`npm run type-check` — TypeScript, no emit. It does not see sandbox
restrictions: those fail only at runtime (`sandbox-restrictions.md`).

"Run Checks" means this command. Same error after two fix attempts →
stop and report it.
