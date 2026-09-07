# Oxlint migration candidate

This draft adds an opt-in oxlint command. ESLint remains the default for CI,
editors and `bun run lint` while compatibility findings are resolved.

```sh
bun install --frozen-lockfile
bun run lint-oxlint       # generates CLJS output, then lints
bun run lint-oxlint-pure  # uses existing CLJS output
bun run test-oxlint
```

Oxlint is pinned to 1.81.0. The command runs one lint process with four native
threads. It does not use a persistent lint cache or a custom native build.

## Configuration and maintenance

`config.mjs` holds the shared ESLint policy: rules, options, file globs, globals
and settings. `eslint.config.mjs` supplies ESLint's parsers and plugins;
`oxlint/config.mjs` maps the same policy to native rules and selected JS plugins.
New files are matched by globs, with no generated file inventory. JS plugin
settings are merged per matching policy scope because oxlint does not support
all those settings in native overrides.

`recommended-rules.json` and `oxlint/rule-defaults.json` snapshot dependency
presets and defaults so oxlint does not load ESLint's entire parser/plugin
configuration at startup. After upgrading lint dependencies, run
`bun run lint-config-update`, review the resulting policy changes, and update
`oxlint/rule-map.json` for new enabled rules. Tests detect stale snapshots, and
configuration loading rejects enabled rules without a mapping. ESLint's
severity-only option inheritance is made explicit where oxlint resets options.

The JS adapters use package exports and load the plugins needed by the mapped
rules. Legacy ttag and i18next still use `@eslint/compat`. The Metabase
`no-module-side-effects` rule constructs scope data only when needed. Native
unused-variable analysis already recognizes JSX references, so its redundant
`react/jsx-uses-vars` helper is omitted in oxlint.

## Boundary and resolver adapter

`oxlint-boundaries.mjs` implements the two boundary checks used here, compiling
`module-boundaries.mjs` once. Its tests compare all 10,000 declared module pairs
with the upstream evaluator, including ordered allow/disallow rules and
transitional exceptions. Unsupported policy features throw.

`oxlint-import-resolver.mjs` shares the published `oxc-resolver` implementation
between boundary and import checks. This is a JS adapter around a published
native resolver, not a custom Rust lint plugin. It retains the different legacy
and import-x resolution precedence, aliases, extensions, package entry fields,
externals, loader/query handling and symlink behavior. Fixture tests compare
against both existing resolvers. Changes to the Rspack resolver configuration
need corresponding adapter review; unsupported options throw.

Resolution results are reused only within one CLI invocation over a fixed tree.
Start a new invocation after changing files, dependencies or configuration;
this adapter is not an editor/watch integration.

## Performance and remaining compatibility work

The earlier controlled comparison on 11,949 paths, using one process and four
native threads without a persistent cache, was:

| Candidate                                                             | Runs              | Mean    |
| --------------------------------------------------------------------- | ----------------- | ------- |
| Boundary/resolver adapters plus patch-free optimizations (this draft) | 16.074 / 15.581 s | 15.83 s |
| Same candidate plus six dependency patches (stacked follow-up)        | 11.202 / 11.345 s | 11.27 s |

Those are development benchmark results, not a guarantee for other machines.
The runnable glob configuration also includes the newly added implementation
and tests; the PR descriptions record its fresh measurements.

The native migration still reports findings against the clean ESLint baseline.
They include JS plugin suppression names (notably `import/order`), unused disable
comments, JSX entity text in i18next, builtin-global redeclarations, duplicate
imports, optional-chain checks, Jest conditional expectations, and a handful of
other native-rule differences. The full candidate intentionally exits nonzero
until these are resolved. These are migration blockers, not accepted policy
changes. Conditional CSS-module linting also remains in ESLint.

Custom OSS/analytics/H restrictions and focused-test checks retain their
existing JS rules and fixes. Import ordering retains import-x. Rule removals,
stronger native checks and altered sorting policy are separate decisions.

To reproduce the full lint timing with generated assets already present:

```sh
/usr/bin/time -p bun run lint-oxlint-pure --format json > /tmp/oxlint-result.json
```

Run each candidate sequentially under comparable machine load. Compare
normalized diagnostics as well as elapsed time; an early configuration error
is not a valid benchmark.
