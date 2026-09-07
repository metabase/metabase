# Oxlint migration

Oxlint is the JavaScript/TypeScript linter used by `bun run lint`, staged-file
checks and frontend CI, including module boundaries. Oxfmt retains formatting;
import ordering retains the existing import-x policy. ESLint stays installed as
a dependency of retained rules and as a reference for the previous policy.
Its full-tree diagnostics intentionally differ for the three rules below.

```sh
bun install --frozen-lockfile
bun run lint-oxlint       # generates CLJS output, then lints
bun run lint-oxlint-pure  # uses existing CLJS output
bun run lint-oxlint-fix
bun run test-oxlint
```

The entry point is `oxlint.config.mts`, avoiding Node's ambiguous-module warning.
Oxlint is pinned to 1.81.0. The command uses one process with four native threads,
no persistent lint cache and no custom native build. The frontend CI ESLint
result cache is removed; CLJS generation is retained for resolution/build inputs.

## Accepted rule differences

These three native rules replace expensive upstream JS checks. The choice is
explicit; the migration does not claim identical ESLint semantics everywhere.

| Rule | Difference and reason for accepting it |
| --- | --- |
| TypeScript `no-unused-vars` | Native considers a value used through TypeScript `typeof` to be used and accepts the tested unused generic parameters in ambient interface augmentations. Those declarations are useful to this TS codebase; requiring suppressions adds noise. Eight redundant suppressions are removed. Ordinary unused values still report. |
| `import/no-duplicates` | Native requires a mixed type/value import and a second value import from the same module to be combined. This is a modest style change with measurable savings. Imports are consolidated without changing import-order policy. Pure named `import type` plus value imports remain allowed; redundant namespace aliases are consolidated too. |
| React `display-name` | Native recognizes some mocked `forwardRef` calls upstream skips, but misses some anonymous class HOCs upstream checks. We accept that tradeoff for measurable savings and reduced legacy class-component checking. The affected mock gets a display name; the existing named HOC receives a narrow exception for a native false positive. |

Native `complexity` retains the maximum of 55. Its report starts at the arrow
function's opening parameters, whereas ESLint reports at the arrow token. The
CardEmbed exception now brackets just that header so both engines honor it;
the Visualization exception uses the native rule name. Threshold fixtures pass
in both engines. A broader 174-case probe found only an ambient-declaration
report at a maximum of zero, which is outside our configuration.

Behavioral fixtures assert both the retained rules and the intended differences.
A config regression test ensures disabling an ESLint base rule cannot disable
its TypeScript extension when both map to one native rule. Earlier exploratory
unused-vars timings predated that fix and must not be treated as equivalent
coverage; use the final measurements below.

Low-cost upstream fallbacks stay in place for `no-redeclare`, unsafe optional
chaining, array constructors, empty object types, export checking,
import restrictions and the two differing Jest checks. Native optional-chain
checking and some array/export diagnostics may be useful future policy changes,
but semantic changes without demonstrated savings are outside this migration.
Custom OSS/analytics/H restrictions and focused-test checks retain their rules
and fixes.

## Configuration and compatibility

`config.mjs` holds shared rule options, file globs, globals and settings.
`eslint.config.mjs` supplies the legacy parsers/plugins; `oxlint/config.mjs` maps
that policy to native rules and selected JS plugins. New files use glob matching,
not a benchmark file inventory. JS settings are merged by matching policy scope.

Retained JS rules use matching names in ESLint and oxlint so suppressions keep
targeting the intended check. Source comment renames are mechanical; they do
not remove the original exceptions. The JSX translation adapter decodes entities
as the existing parser does, and two JSX exceptions use bounded comments because
diagnostic locations differ. A small scope view preserves module-local bindings
in import-free JS files. The existing console global for one custom-viz build
script moves from its directive into the configuration.

The import adapter supplies the existing parser lazily when upstream export
analysis needs to parse a dependency: oxlint's parser object is otherwise a stub.
Its language-options view preserves oxlint's lazy getters rather than eagerly
reading AST/global information. With the three accepted native rules enabled,
this avoids unnecessary global decoding without changing the rule policy.

Published upgrades: i18next 6.1.4 removes its compatibility wrapper while retaining
JSX decoding; import-x is 4.17.1 and depend is 1.5.0. The i18next 6.1.5 matching
changes are deferred. Testing Library remains 7.15.4: the tested 7.16.2 upgrade
stops reporting `element.children[2]`, with no established performance benefit.
The import-x resolver-reuse fix does not replace our distinct legacy resolution
path, so the adapter remains.

`recommended-rules.json` and `oxlint/rule-defaults.json` snapshot dependency
presets/defaults without importing the entire ESLint setup at CLI startup.
After lint dependency upgrades, run `bun run lint-config-update`, review policy
changes and update `oxlint/rule-map.json` for new enabled rules. Tests detect
snapshot drift; loading rejects an enabled rule without a mapping.

The optional postcss-modules plugin is loaded only under CI or
`LINT_CSS_MODULES=true` when installed, matching the old hook. This checkout does
not install it; its plugin execution is not part of the measured/tested baseline.

## Boundary and resolver adapter

`oxlint-boundaries.mjs` implements our two boundary checks, compiling the module
policy once. Tests compare all 10,000 declared module pairs against upstream,
including ordered rules and transitional exceptions. Unsupported features throw.

`oxlint-import-resolver.mjs` shares published `oxc-resolver` between boundary and
import checks. This is a JS adapter around a published native resolver, not a
custom Rust lint plugin. It retains the different legacy/import-x precedence,
aliases, extensions, entry fields, externals, loader/query handling and symlink
behavior. Tests compare both existing resolvers. Rspack resolver changes need
adapter review; unsupported options throw.

The build and lint resolver share lightweight `resolve-config.js` modules for
the app and SDK. Lint no longer imports either complete Rspack configuration.
Integration checks cover development/production and OSS/EE settings.

Resolution results are reused within a fresh CLI invocation over a fixed tree.
Bare imports share a key at the nearest package.json/node_modules ancestor;
relative, loader and query specifiers retain directory-specific keys. Configured
aliases/fallbacks must be absolute for that reuse; unsupported values throw.
Derived plugin contexts are reused with current-file getters, boundary imports
use direct listeners, glob matchers are compiled once, and missing source-file
probes avoid constructing exceptions.
Editor/watch invalidation is not implemented. Existing ESLint editor diagnostics
can differ under the accepted policy changes; this PR does not claim editor
parity or remove all ESLint dependencies.

## Validation and performance

Paired, sequential measurements on macOS ARM64, Node 24.14.0 and Bun 1.3.14,
one lint process, four native threads, no persistent lint cache:

| Comparison | Control mean | Candidate mean | Interpretation |
| --- | --- | --- | --- |
| All four published upgrades | 18.152 s | 18.145 s | No established speed change; Testing Library had a coverage difference. |
| Retained three upgrades | 17.921 s | 17.730 s | Small difference within desktop variation; keep the wrapper simplification. |
| Native complexity, after upgrades and `.mts` rename | 17.596 s | 17.466 s | Small measured difference; removes the JS fallback. |
| Shared lightweight resolve configuration | 17.342 s | 16.739 s | About 0.60 s faster. |
| Resolver/context/glob/listener reuse | 16.721 s | 15.700 s | About 1.02 s faster. |

The final base runs were **15.157 / 15.311 / 16.631 s**, all exit 0, **11,980 files**,
zero findings. The two additional files are the shared resolver configurations.
Comparisons were collected separately under variable desktop activity: do not
add their savings or compare absolute times across batches. These timings exclude
CLJS compilation, formatting and type-checking. No CLJS build prerequisite was
removed in this change.

All 21 base compatibility tests pass (including the build-resolution integration
check), and all 490 custom-rule cases pass. Published-plugin fixtures compare
160 cases, including 67 violations, with identical diagnostics and autofixes;
the separate full-tree check caught the Testing Library regression above.
The stacked PR records its corresponding patched measurements.

Run candidates sequentially under comparable CPU load with generated assets
present, checking exit status, file count and diagnostics alongside timing:

```sh
/usr/bin/time -p bun run lint-oxlint-pure --format json > /tmp/oxlint-result.json
```

The stacked follow-up isolates six version-specific dependency patches. This
base PR adds none; existing unrelated project patches remain unchanged.
