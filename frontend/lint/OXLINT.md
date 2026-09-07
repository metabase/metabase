# JavaScript and TypeScript linting

Oxlint runs the JavaScript/TypeScript checks in `bun run lint`, staged-file checks
and frontend CI, including module boundaries. Oxfmt owns formatting. Import
ordering uses the existing import-x policy. ESLint remains installed for retained
plugins and compatibility tests.

## Commands

```sh
bun install --frozen-lockfile
bun run lint-oxlint       # generates CLJS output, then lints
bun run lint-oxlint-pure  # uses existing CLJS output
bun run lint-oxlint-fix
bun run test-oxlint
```

`oxlint.config.mts` is the entry point. Production commands use one process with
four native threads. The pure command excludes formatting, type checking and
CLJS compilation. Generated CLJS is still needed for filesystem resolution.

## Accepted rule differences

These native rules replace expensive JS checks with explicit policy tradeoffs.

| Rule                        | Difference and reason                                                                                                                                                                                                                                                                      |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| TypeScript `no-unused-vars` | Values referenced through `typeof` count as used. The tested ambient interface augmentations also accept unused generic parameters. This avoids suppressions for useful TS declarations. Removing the two file-wide suppressions restores unused-variable checking throughout those files. |
| `import/no-duplicates`      | A mixed type/value import and a second value import from the same module must be combined. Separate pure named type and value imports remain allowed in the tested case. We accept this style change for the native rule's speed.                                                          |
| React `display-name`        | Native checks some mocked `forwardRef` calls upstream skips, but misses some anonymous class HOCs. We accept the legacy-class tradeoff for speed. `ExplicitSize` has a narrow exception because it already names the wrapped component.                                                    |

Native `complexity` keeps the limit of 55. ESLint and oxlint report different
positions in multiline arrow headers, so the CardEmbed suppression brackets
only the header. Two JSX suppressions also use bounded comments for differing
report locations. Retained JS checks use the same aliases in both engines so
suppression comments target the same rules.

## Configuration

- `config.mjs` holds shared rule options, file scopes, globals and settings.
- `eslint.config.mjs` supplies the reference parsers and plugins.
- `oxlint/config.mjs` maps the policy through `oxlint/rule-map.json` to native
  rules and selected JS adapters. Native namespaces are declared explicitly.
- `recommended-rules.json` and `oxlint/rule-defaults.json` snapshot plugin presets
  and defaults, avoiding full ESLint configuration loading during normal lint.

After dependency upgrades, run `bun run lint-config-update`, review snapshot
changes and map any newly enabled rules. Configuration rejects unmapped rules.
Wrapped plugins must provide `create`: `createOnce` is omitted to preserve the
wrapper's per-file settings and context handling. The no-only-tests plugin loads
directly and uses its published `createOnce` API.

Files matching the same policy scopes share settings objects. Their identity
allows the resolver's WeakMaps to reuse services. The last-file lookup avoids
repeating file matching across rules. The import adapter supplies its parser
lazily when export analysis requests it. JSX entity decoding and an import-free
JS scope view preserve retained rules' behavior.

The optional postcss-modules check loads when installed and either CI or
`LINT_CSS_MODULES=true` is set. It uses the same conditional hook as ESLint.

## Boundary and resolver contracts

`module-boundaries.mjs` supplies elements, enforced rules, options and settings
to both engines. `oxlint-boundaries.mjs` compiles the supported policy subset.
Configuration rejects differing boundary options and unsupported settings;
compilation rejects unsupported selectors and descriptors. The parity test
compares every declared module pair with the upstream evaluator.

`oxlint-import-resolver.mjs` shares published `oxc-resolver` between boundary and
import checks. It preserves separate import-x and legacy resolution precedence,
aliases, extensions, entry fields, externals, loaders, queries and symlink paths.
Unsupported resolver policies throw. Alias and fallback targets must be absolute
so bare imports can reuse resolution across directories within a package root.

The app and SDK share lightweight build-resolution modules. The SDK owns a
separate alias object: its three enterprise overrides apply in every edition.
Integration tests snapshot lightweight settings before loading full build
configs and check development/production and OSS/EE combinations.

Resolution reuse belongs to one CLI invocation over a fixed tree. Bare imports
use the nearest package.json/node_modules ancestor; relative, loader and query
specifiers retain directory-specific keys. Construct a fresh resolver service
after filesystem, dependency or configuration changes. Persistent caching and
editor/watch invalidation are not implemented.

## Validation

`bun run test-oxlint` checks policy mapping, real-engine violations and
suppressions, boundary parity, resolver behavior and build integration. Custom
rules use oxlint's RuleTester through the `lint-rules` Jest project. Timings and
migration experiments are recorded in the draft PR descriptions rather than
maintained as configuration documentation.

## Dependency performance patches

The performance branch adds these patches through the existing patch-package
installation flow. The base migration uses the unpatched dependencies.

| Package | Optimization |
| --- | --- |
| eslint-plugin-import-x 4.17.1 | Classify import/order groups that do not depend on resolution. |
| eslint-plugin-react 7.37.5 | Prefilter lifecycle names for no-deprecated. |
| eslint-plugin-depend 1.5.0 | Reuse equivalent replacement lists and index module prefixes, preserving precedence. |
| eslint-plugin-ttag 1.1.0 | Use sourceCode.getScope and skip function-scope work for no-module-declaration. |
| eslint-plugin-i18next 6.1.4 | Compile no-literal-string matching expressions once. |
| eslint-plugin-testing-library 7.15.4 | Prefilter scope work in no-debugging-utils, no-unnecessary-act and prefer-screen-queries. |

The ttag adapter relies on its API patch: removing that patch also requires
restoring fixupPluginRules in the adapter. i18next's published release supplies
its API compatibility; its patch is only a performance optimization.

The patch-parity test reconstructs upstream packages in temporary directories
and compares diagnostics and fixes. Real-oxlint fixtures exercise the retained
rules through the production adapters. Review patches and these fixtures when
upgrading dependencies, preferring equivalent published fixes.
