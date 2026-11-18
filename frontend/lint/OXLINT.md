# JavaScript and TypeScript linting

Oxlint runs the JavaScript and TypeScript checks in `bun run lint`, the
staged-file checks and frontend CI, including module boundaries. Oxfmt formats
the code and sorts imports. ESLint stays installed for the plugins oxlint runs
through its JS plugin API, the compatibility tests and `bun run
module-boundaries`, which the weekly stats collector runs.

Oxfmt moves value imports past side-effect imports when it sorts. A file whose
import order matters at runtime keeps that order with `// oxfmt-ignore` comments.

## Where the configuration lives

These files hold the lint configuration. Paths are relative to `frontend/lint`
unless they say otherwise.

- `oxlint.config.mts` in the repo root is the entry point oxlint loads.
- `config.mjs` holds the rule options, file scopes, globals and settings. Both
  engines read it.
- `oxlint/config.mjs` translates that policy into an oxlint config.
- `oxlint/rule-map.json` maps each ESLint rule name to a native oxlint rule or a
  JS plugin rule.
- `recommended-rules.json` and `oxlint/rule-defaults.json` are generated
  snapshots of the plugin presets and rule defaults.
- `eslint.config.mjs` in the repo root supplies the parsers and plugins for the
  ESLint side of the compatibility tests.

## Type-aware rules

`oxlint-tsgolint` runs the rules that need type information, such as
`@typescript-eslint/no-unsafe-return`. ESLint does not run them: `eslint.config.mjs`
turns them off because it has no type information. They apply to the files the
root `tsconfig.json` type-checks, except tests and stories; `config.mjs` reads
the scope from `tsconfig.json`. They read types from the compiled CLJS output, so
`bun run lint-oxlint` builds CLJS first and CI compiles it before linting.
`lint-oxlint-pure` reuses the existing build; a stale or missing one can change
the results.

Files that had `no-unsafe-*` violations when the rules were enabled start with a
`/* eslint-disable ... -- FIXME: any-typed values */` comment that lists the
rules each file breaks. To clean up a file, remove the comment, fix what the
rules report, and lint again. Lint reports a rule in the comment that no longer
finds a problem, so remove it from the comment when the file stops breaking it.

## After a dependency upgrade

Run `bun run lint-config-update` and review the snapshot changes. `createConfig`
throws on an enabled rule that has no entry in `oxlint/rule-map.json`, so add an
entry for each rule the upgrade enables. Then run `bun run test-oxlint`.

## Known limits

The import resolver reuses its results within one CLI run over a fixed tree.
Persistent caching and invalidation for editors or watch mode are not
implemented.
