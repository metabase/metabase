# Project facts

## Files

- `src/index.tsx` — the entry: default-exports the
  `CreateCustomVisualization` factory wrapped in `defineConfig`. You keep
  the whole viz in this file. Other `src/` files, except
  `src/index.test.tsx`, are user code (`operations.md`, User edits).
- `src/index.test.tsx` — the viz's tests (`testing.md`).
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

- Scaffold-owned, never hand-edited except when renaming: `package.json`,
  `vite.config.ts`, `tsconfig.json`, `metabase-plugin.json`. Installing an
  agreed library (Libraries) updates `package.json` through npm.
- No viz built yet: `src/index.tsx` is still the scaffold's thumbs-up/down
  template, possibly with small edits.

## Libraries

A third-party library is fine when the user asks for one, or when it
clearly simplifies the viz — then name it and say why, install it only
after the user agrees, and record it in the statement's Notes.

- Prefer small modular packages (`d3-scale`, `d3-shape`, `d3-sankey`)
  over whole frameworks; the packed plugin must stay under 5 MB
  compressed.
- It must work inside the sandbox (`sandbox-restrictions.md`): pure
  computation or rendering to SVG, DOM or canvas; no network, workers,
  injected `<style>` or global keyboard listeners.
- The main agent installs it with `npm install --save-exact <package>`
  before build; subagents never install.

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

- `npm run type-check` — TypeScript, no emit.
- `npm test` — the tests against a mocked host (`testing.md`).

Neither sees sandbox restrictions: those fail only at runtime
(`sandbox-restrictions.md`). "Run Checks" means both commands. Same error after two fix attempts →
stop and report it.
