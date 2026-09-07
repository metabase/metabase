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

Behavioral fixtures assert both the retained rules and the intended differences.
A config regression test ensures disabling an ESLint base rule cannot disable
its TypeScript extension when both map to one native rule. Earlier exploratory
unused-vars timings predated that fix and must not be treated as equivalent
coverage; use the final measurements below.

Low-cost upstream fallbacks stay in place for `no-redeclare`, unsafe optional
chaining, array constructors, empty object types, complexity, export checking,
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
The tested alternative that deferred more context getters did not demonstrate a
speedup and was not adopted.

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

Resolution results are reused within a fresh CLI invocation over a fixed tree.
Editor/watch invalidation is not implemented. Existing ESLint editor diagnostics
can differ under the accepted policy changes; this PR does not claim editor
parity or remove all ESLint dependencies.

## Validation and performance

Final timings are recorded after the accepted native replacements, compatibility
fixes and the base/extension rule configuration fix. They supersede exploratory
runs with unresolved diagnostics or different effective rule coverage.

| Candidate | Runs | Mean | Files | Findings |
| --- | --- | --- | --- | --- |
| Base, without the six performance patches | 17.702 / 18.085 s | 17.894 s | 11,978 | 0 |

The stacked PR records its corresponding patched measurements.

These are local measurements, not promises for other machines. Run candidates
sequentially under comparable CPU load with generated assets present:

```sh
/usr/bin/time -p bun run lint-oxlint-pure --format json > /tmp/oxlint-result.json
```

Check exit status, file count and diagnostics alongside timing. `test-oxlint`
checks config/defaults, accepted semantic differences, retained behavior,
boundaries and resolver parity. The custom lint-rule suite uses oxlint's
RuleTester and retains its 490 existing cases.

The stacked follow-up isolates six version-specific dependency patches. This
base PR adds none; existing unrelated project patches remain unchanged.
