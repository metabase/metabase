# Linting with oxlint

ESLint has been removed. **oxlint** is the only JavaScript/TypeScript linter, with
**oxfmt** handling formatting and **tsc** handling everything the type system can
express.

## What runs where

| Command | What it does | Whole-tree cost |
| --- | --- | --- |
| `bun run lint-oxlint` | 200 rules: oxlint's native Rust rules plus 10 plugins loaded through `jsPlugins` | ~8s |
| `bun run lint-boundaries` | Module-boundary enforcement (`.oxlintrc.boundaries.json`, generated) | ~53s |
| `bun run lint-format` | oxfmt (quote style, spacing, **import order**) | ~1s |
| `bun run type-check` | tsc — undefined names, unresolved imports, duplicate params | — |

`lint-boundaries` is an order of magnitude slower than the main pass, so it is
**not** part of `bun run lint`. CI runs it as its own parallel job
(`fe-lint-boundaries`) to keep it off the critical path. The cost is not import
resolution, which oxlint does natively: it is that `eslint-plugin-boundaries` is a JS
plugin oxlint runs single-threaded, so evaluating its rules over every file's imports
dominates. Loading the plugin adds ~0.5s; turning its rules on takes the whole-tree
run from ~8s to ~50s. Both boundary rules are file-local, so restricting the pass to
changed files is the lever that speeds it up, not caching the resolver.

For reference, the ESLint pipeline it replaced cost ~4.4s warm and ~144s cold
(cache miss). oxlint has no cache, so its ~8s is paid on every run.

Rule cost is lopsided. Turning off all eight of the restored rules saves ~0.6s, and
essentially all of that is the two that run as JS plugins
(`i18next/no-literal-string` and `metabase/no-conditional-expect`, ~0.7s together).
The native Rust rules are free within measurement noise, so prefer a native rule over
a `jsPlugins` one whenever both exist.

## `jsPlugins`: ESLint plugins running inside oxlint

`.oxlintrc.json` loads these unmodified from `node_modules`:

- `eslint-plugin-metabase` (our custom rules), `-testing-library`, `-jest-dom`,
  `-storybook`, `-cypress`, `-depend`, `-no-only-tests`, `-chai-friendly`
- two local stand-ins under `frontend/lint/`, `-ttag-scope` and `-i18next-scope`,
  each published under the namespace of the plugin it replaces
- `.oxlintrc.boundaries.json` additionally loads `-boundaries`

They keep working because oxlint implements the ESLint rule API: `create(context)`,
visitor keys, esquery selectors, `node.parent`, `context.report`, `context.options`
and `context.filename`. Rules taking options need a `meta.schema` or oxlint rejects
them.

Three things do **not** carry over, and each has bitten us:

- **`context.settings` is whatever `.oxlintrc.json` puts in its top-level `settings`
  key, defaulting to `{}`.** A rule reading a setting we never declared reports
  nothing at all — it does not error. `metabase/no-external-references-for-sdk-package-code`
  needs `settings["import/resolver"]`, and `boundaries/*` needs
  `settings["boundaries/elements"]`.
- **oxlint globs have no extglob support.** `**/*.stories.@(ts|tsx)` matches
  nothing and the whole override goes silently inert. Write `{ts,tsx}`.
- **A rule from a built-in plugin needs that plugin in `plugins`.** The top-level
  `plugins` array lists `import`, `react`, `typescript` and `jest`; an override can
  declare its own. Configure a rule from a plugin that is not listed in scope and it
  silently never fires. `categories` is `{"correctness": "off"}`, so listing a plugin
  only makes its rules available — it never turns any on by itself.
- **oxlint anchors diagnostics at a different token than ESLint.** A
  `disable-next-line` written for ESLint can land one line off. JSX
  `{/* eslint-disable-next-line rule */}` comments do work, but must sit directly
  above oxlint's anchor line. When the reported node starts at a line boundary —
  JSX text beginning right after a multi-line opening tag — the anchor lands one
  line earlier than the text, and `disable-next-line` misses it. Use the
  `eslint-disable` / `eslint-enable` block form there.

## Import resolution

`settings["import/resolver"]` uses the tsconfig-paths resolver, not the rspack one.
Resolution was ~70% of the old ESLint cold cost (disabling every resolving rule took
a cold run from 145s to 44s), and the tsconfig resolver is faster and resolves
aliases (`custom-viz`) that the webpack resolver silently failed on.

Both tsconfigs are required — `project: ["./tsconfig.json", "./e2e/tsconfig.json"]`.
The root tsconfig does not include e2e, and pointing at it alone produced 1025
`import/no-unresolved` false positives there.

**Do not remove `settings["import/resolver"]` even though `eslint-import-resolver-typescript`
is no longer a dependency.** oxlint reads the `project` list from this setting to know
which tsconfigs to resolve aliases against, then resolves natively — it never loads the
resolver package, which is why the package could be dropped. Deleting the setting makes
alias resolution fall back to nothing, so `boundaries/element-types` silently classifies
every aliased import as unknown and stops reporting violations. It fails clean, not loud.

`ee-overrides` is an rspack-only alias with no tsconfig path, so it stays
unclassifiable and keeps its `import/order` suppression in
`frontend/src/metabase/static-viz/index.tsx`.

## Rules dropped, and why

Removing ESLint means losing rules oxlint cannot run. They fall into these groups.

### Superseded by TypeScript or oxfmt (no real loss)

`tsc` runs with `strict: true` over 96% of the codebase, so these were redundant:

| Rule | Covered by |
| --- | --- |
| `no-undef` | tsc `TS2304` on `.ts`/`.tsx`; still linted on `.js`/`.jsx`, see below |
| `no-dupe-args` | a syntax error in any ES module, so unreachable |
| `import/no-unresolved` | tsc `TS2307` |
| `react/jsx-uses-vars` | props are typed; the rule has no standalone diagnostic anyway |
| `no-octal` | syntax error in ESM/TS |
| `quotes` | oxfmt owns quote style |

`allowJs` is on but `checkJs` is **not**, so the 434 remaining `.js`/`.jsx` files (317
of them in e2e) get no type checking. `no-undef` is therefore enabled for those files
specifically, which is the part of the gap that mattered — ESLint enforced it there
and tsc cannot.

It needs globals, or it reports 19,065 undefined identifiers that are really just
`cy`, `Cypress`, `context` and friends. The override carries
`env: { browser, node, es2024, jest }` plus the Cypress globals the old config
declared through `languageOptions.globals`.

Two rules from this group cannot be restored for `.js` files: `react/prop-types` is
accepted by oxlint but never fires (a no-op), and `no-dupe-args` is unreachable.
Converting e2e to TypeScript is what actually closes the rest.

### oxlint does not implement them

`import/order`, `no-restricted-syntax`, `react/no-deprecated` and
`ttag/no-module-declaration` were all in this group. All four have since been
recovered: the last three as local rules (see below), and `import/order` by moving
the job to oxfmt (see next section).

### oxlint's implementation diverges

Eight rules initially looked like losses. Five have since been restored, either by
configuring them the way ESLint had them or by fixing the code they flagged:

| Rule | Restored how |
| --- | --- |
| `no-unused-vars` / `typescript/no-unused-vars` | options, see below — 203 findings to 2 |
| `no-unsafe-optional-chaining` | fixed 4 real latent bugs |
| `typescript/no-array-constructor` | fixed 1 real bug |
| `import/no-duplicates` | merged 17 duplicate import statements |
| `import/export` | removed a dead `export *` and a duplicated type export |

The `no-unused-vars` gap was never a real divergence, only an options mismatch.
oxlint's defaults are stricter than what ESLint enforced. Configured with ESLint's
own settings (`args: "none"`, `caughtErrors: "none"`, `^_.+$` ignore patterns), it
drops from 203 findings to 2, both genuine. Going stricter than ESLint is possible
but costs ~180 mechanical edits: 116 unused parameters and 64 unused catch bindings
would need an `_` prefix.

Two more were recovered by routing around oxlint's version rather than using it:

| Rule | Now enforced as | How |
| --- | --- | --- |
| `jest/no-conditional-expect` | `metabase/no-conditional-expect` | the upstream rule, re-exported through our plugin |
| `react/display-name` | `react/display-name` | oxlint's own, plus 2 suppressions |

oxlint's `jest/no-conditional-expect` reports any `expect()` in a conditional,
including setup helpers that are not test callbacks — 10 findings against upstream's
3. The upstream rule only inspects code reachable from an `it`/`test` callback, which
is what ESLint enforced, and all 3 of its findings already carried disable comments.
`jest` is a reserved namespace, so the rule could not keep its name and those 3
comments were renamed.

oxlint's `react/display-name` reads any curried function in a `.tsx` file as a
component, so a redux thunk and an HOC factory are flagged (2 of 3 findings). Those
two carry a suppression; the third was a genuine `forwardRef` without a display name.

The last one, `i18next/no-literal-string`, is reimplemented for ttag — see below.
All eight are now enforced.

One suppression is needed for a genuine oxlint bug: it treats `x++` as a write even
when the value is read, so a counter used as a default parameter reads as unused
(`MetricSearch/utils.unit.spec.ts`).

## Guarding rule wiring: `bun run lint-rules`

`bin/lint-rules-check.mjs` is a fast committed guard against the two silent-failure
classes below that a single config can still hide, adapted from the parity checker in
PR #77361. It runs in CI right after `lint-oxlint`.

- **Inert plugin.** A rule enabled under a plugin that is not in `plugins`/`jsPlugins`
  stays in the resolved config but never fires. `oxlint --print-config` cannot expose
  this (it echoes the rule regardless), so the check compares each enforced rule's
  namespace against the plugins the config actually loads.
- **Silent drift.** The enforced rule set is snapshotted in
  `frontend/lint/enforced-rules.json`. Adding or dropping a rule fails the check until
  you re-run `bun run lint-rules --update` and commit the new snapshot, the same
  ratchet pattern as `.clj-kondo/ratchets.edn`.

It cannot catch pattern-semantic dead rules: a rule can be fully wired yet fire on
nothing because a `no-restricted-imports` group uses regex lookaround (unsupported by
the Rust engine) or an extglob that matches nothing. `bun run lint-rule-fixtures`
(`bin/lint-rule-fixtures.mjs`, CI step right after the wiring check) closes that gap
behaviorally: it writes a tiny fixture per at-risk rule at a path matching the rule's
override scope, lints it with the real `.oxlintrc.json`, and asserts the rule fires —
including one case that asserts a negated-glob exception does *not* fire, which is what
proves the pattern engine is actually distinguishing them. The fixtures live under
`__rule-fixtures__` directories and are removed after each run, never committed. Add a
case whenever a rule's correctness depends on a pattern rather than just being enabled.

## Auditing for silently dropped rules

`no-console` was found by accident, so the whole rule set was diffed against the old
config rather than waiting for the next accident. The old `eslint.config.mjs` still
evaluates — every plugin it imports is installed except `@eslint/compat`, whose
`fixupPluginRules` is an identity shim. Resolving it yields 211 enabled rules against
our 198, a difference of 19.

Sixteen of those were already accounted for: seven intentionally dropped as redundant
with tsc or oxfmt, four recovered under a different name (`import/order`,
`no-restricted-syntax`, `react/no-deprecated`, `jest/no-conditional-expect`), and five
that the old config explicitly turned `off`.

**Beware the union.** "Enabled in at least one config entry" is not the same as
effectively enabled. `prefer-rest-params` and `no-unused-expressions` both look
enabled that way, but each is turned on by a preset scoped to `.ts`/`.tsx` and then
switched off in that same block, so ESLint never reported on them. They are now
enabled here anyway: between them they found 2 genuine problems, each fixed in
place. Confirm against master before concluding a rule was lost, but a rule ESLint
never ran is still worth turning on.

The genuine losses:

| Rule | What happened |
| --- | --- |
| `no-console` | never carried over; 12 stale disable comments were the only trace |
| `react-hooks/rules-of-hooks` | never carried over — oxlint implements it, 0 findings |
| `react-hooks/exhaustive-deps` | never carried over — `warn`, which `--max-warnings 0` makes fatal |
| `prefer-rest-params` | never effectively enabled; 1 finding, `arguments` forwarding in `e2e/support/cypress.js` |
| `no-unused-expressions` | never reached `.js`/`.jsx`; 1 finding, a `cond && fn()` statement in a `.jsx` effect |

`no-unused-expressions` on `.js`/`.jsx` needs care in `e2e`, where
`chai-friendly/no-unused-expressions` must take over so `expect(x).to.be.true`
is not flagged. oxlint applies overrides in order, so that exemption is restated
*after* the `.js`/`.jsx` block that enables the base rule; declaring it only
earlier would let the later block win.

## Regex patterns cannot use lookaround

`no-restricted-imports` in `e2e/test-component/**` was configured but **silently
inert**: its pattern was

```
^metabase/(?!utils/promise$|embedding-sdk/test/).*
```

oxlint matches with Rust's `regex` crate, which has no lookaround. It does not report
the bad pattern — it just never matches. Rewritten as a negated glob group, which
oxlint does support:

```json
{ "group": ["metabase/**", "!metabase/utils/promise", "!metabase/embedding-sdk/test/**"] }
```

Any `regex` containing `(?=`, `(?!` or `(?<` is dead config. There is one such
pattern in the repo and this was it.

## Stale `eslint-disable` comments

`lint-boundaries` passes `--report-unused-disable-directives`, so a directive that
suppresses nothing fails the build — the same guard master's ESLint had.

It lives on `lint-boundaries` rather than `lint-oxlint` on purpose.
`.oxlintrc.boundaries.json` is a superset of the main config, so it is the only one
that knows every rule. Run the check under the main config and it reports the
`boundaries/element-types` suppression in `TreeTableRow.tsx` as unused, because that
rule is not loaded there — deleting it on that advice would break the boundaries job.
The trade-off is that stale directives surface in the ~53s job rather than the ~8s
one.

Cleaning up to reach zero turned up two things worth knowing:

- **A directive naming a rule under its ESLint name is inert.** Seven
  `@typescript-eslint/no-unused-vars` comments suppressed nothing, because oxlint
  calls the rule `typescript/no-unused-vars`. They look load-bearing and are not.
- **`no-console` had been dropped silently.** ESLint enforced it; nothing in the
  oxlint config did. Twelve stale `// eslint-disable-next-line no-console` comments
  were the only evidence. It is restored, and those comments are load-bearing again.

## `no-console` and ESLint's option inheritance

Restoring `no-console` exposed a config-semantics difference. ESLint flat config
**retains previously configured options** when a later entry specifies only a
severity, so the old config's

```js
{ files: ["**/*.{js,jsx,ts,tsx}"], rules: { "no-console": ["error", { allow: ["warn", "error", "errorBuffer"] }] } }
{ files: ["e2e/**/*.cy.spec.*"],   rules: { "no-console": "error" } }
```

kept the `allow` list in Cypress specs. oxlint resets to rule defaults instead, which
made `console.warn` an error in every `.cy.spec` file. **Repeat the options in every
override**, or the narrowing override silently becomes stricter than intended.

## Import order is now oxfmt's job, not the linter's

oxfmt's `sortImports` replaces `import/order`. It is off by default and can only be
switched on from the config file, so it lives in `.oxfmtrc.json`. Three differences
from the ESLint rule:

- **It is enforced by `lint-format-pure`, not `lint-oxlint`.** A misordered import is
  a formatting failure now, and `bun run format` fixes it.
- **It is not opt-out-able per rule.** `eslint-disable import/order` does nothing.
  Use `// oxfmt-ignore` above the import, which pins exactly one statement.
- **The comparator differs in a way that cannot be fully closed.** See below.

### Matching master's order

The naive config reordered 3,491 files, because oxfmt and eslint-plugin-import
disagree on how to compare specifiers. eslint compares path **segments**, so
`metabase` sorts before `metabase-types` (segment `metabase` is shorter). oxfmt
compares the **whole string**, and `-` (0x2D) sorts before `/` (0x2F), so
`metabase-types/api` lands before `metabase/api`. oxfmt exposes no option to change
the comparator.

The internal block is recovered with `customGroups`. The single `internalPattern`
group is split into four ordered groups so `metabase/` precedes the hyphenated
`metabase-*` scopes, matching eslint:

- `internal-pre-metabase` — every first-party prefix that sorts before `metabase`
- `metabase-core` — `metabase/**`
- `metabase-scoped` — `metabase-lib`, `metabase-types`, `metabase-enterprise`
- `internal-post-metabase` — `sdk-ee-plugins`

The `{ "newlinesBetween": false }` markers between them override the global
`newlinesBetween: true`, so the four groups read as one block with no blank lines,
exactly as eslint left it. This drops the churn from 3,491 files to 70.

Those 70 are the residual the comparator cannot express: the same hyphen-vs-slash
collision at greater depth (`metabase/embedding` vs `metabase/embedding-sdk`) and
among external packages (`react` vs `react-dom`). Enumerating a custom group per
colliding prefix pair at every depth is unbounded and fragile, so these are left as
an accepted, stable difference.

Eleven files are pinned because their import order is load-bearing:

- `frontend/src/metabase/query_builder/reducers.ts` — sorting triggers TS2589
  ("Type instantiation is excessively deep") in the reducer type.
- `frontend/src/metabase/static-viz/index.tsx` — `ee-overrides` is an rspack-only
  alias with no tsconfig path, so it cannot be classified into a group.
- the rest are SDK entry points and their tests, which already carried
  `eslint-disable import/order`. They mix side-effect imports that must run first
  (`./lib/sdk-public-path` sets webpack's `publicPath`) with assignments interleaved
  between the imports.

## Testing custom rules

Our custom rules are tested with oxlint's own `RuleTester`, imported from
`oxlint/plugins-dev`. The API matches ESLint's, so the migration was the import
line plus dropping `parser: tseslint.parser` in two files, which oxlint rejects
with "Custom parsers are not supported". It does not need one: TypeScript and JSX
parse natively, selected by the test case's `filename` extension.

The package is ESM-only, so `oxlint` has to appear in `jest.esm-packages.js` or
jest fails with "Cannot use import statement outside a module".

There is an `eslintCompat` option for test cases that depend on ESLint's
1-based columns and its `sourceType` defaults. None of our 309 cases needed it.

This is what let the `eslint` and `typescript-eslint` packages be dropped
entirely. Both were undeclared dependencies that these tests resolved
transitively through the `eslint-plugin-*` packages.

## Rules reimplemented locally

Three rules oxlint cannot provide are reimplemented in our own plugins, which do
load through `jsPlugins`:

| Rule | Replaces | Notes |
| --- | --- | --- |
| `metabase/no-base-color-literals` | the `no-restricted-syntax` selector `Literal[value=/mb-base-color-/]` | oxlint has no `no-restricted-syntax` |
| `metabase/no-deprecated-react-api` | `react/no-deprecated` | `react` is a reserved namespace, so `eslint-plugin-react` cannot be loaded. Covers the React 18-era deprecations only |
| `ttag/no-module-declaration` | the identical upstream rule | lives in `frontend/lint/eslint-plugin-ttag-scope` |
| `i18next/no-literal-string` | `eslint-plugin-i18next`'s rule of the same name | lives in `frontend/lint/eslint-plugin-i18next-scope` |

`no-literal-string` is worth explaining, because the upstream rule *does* load under
oxlint and looks like it works. It does not: it produces 19 findings that are all
HTML-entity artefacts, and never fires on genuinely untranslated JSX text (verified
against fixtures with both default and tuned options). Two things defeat it — it is
built around i18next rather than ttag, and it leans on typescript-eslint parser
services oxlint does not provide.

The replacement is much simpler than upstream because ttag makes it so: translated
copy always reaches the DOM as an expression container (`{t`...`}`), so **any
`JSXText` node still containing a letter is untranslated**. That is a single visitor
with no scope tracking. HTML entities are stripped before the check rather than
decoded, since oxlint hands the rule raw JSXText and `&quot;` would otherwise read as
the word `quot`.

It is published under the `i18next` namespace, which oxlint does not reserve, so the
21 existing `eslint-disable i18next/no-literal-string` comments keep working —
without them the rule reports 73 findings in 15 files instead of 1.

Two details worth knowing:

- **The ttag rule keeps its original name on purpose.** It is published under the
  `ttag` namespace so the existing `eslint-disable-next-line ttag/no-module-declaration`
  comments keep working — naming it `metabase/*` surfaced 153 already-suppressed
  violations. `react` is reserved, so the same trick is impossible there and the two
  suppressions in `react-compat.ts` were renamed instead.
- **It determines module scope by walking `node.parent`,** not `context.getScope()`,
  which oxlint's shim does not provide and which is why the upstream plugin throws.
  It matches only a bare `t`/`jt` tag, exactly like upstream, so the contextual form
  ``c("context").t`...` `` is not flagged.

## Substituting a third-party plugin for a dropped rule

`jsPlugins` loads any ESLint plugin, so a dropped rule can often be recovered from a
different package — **unless oxlint reserves the plugin namespace**. oxlint
implements `import-x`, `react`, `typescript` and `jest` natively and refuses to load
JS plugins under those names:

> Plugin name 'import-x' is reserved, and cannot be used for JS plugins.

A reserved namespace blocks the *name*, not the rule. An upstream rule can still be
re-exported through a plugin of ours under a different namespace, which is how
`metabase/no-conditional-expect` runs the real `eslint-plugin-jest` rule:

```js
module.exports = require("eslint-plugin-jest").rules["no-conditional-expect"];
```

The cost is that existing `eslint-disable` comments naming the old rule stop
matching and have to be renamed. When the namespace is *not* reserved, publish under
the original name instead — `meta.name: "eslint-plugin-ttag"` gives the `ttag`
namespace and the old comments keep working.

Recovered this way:

- `chai-friendly/no-unused-expressions` — loads cleanly and correctly allows
  `expect(x).to.be.ok` while still catching genuine unused expressions.

Available but not adopted:

- `eslint-plugin-simple-import-sort` loads under oxlint and costs ~1.3s. It was the
  fallback for `import/order` before oxfmt's `sortImports` turned out to do the job
  without a plugin. `eslint-plugin-perfectionist` is equivalent.
- `no-restricted-syntax` and `react/no-deprecated` have no drop-in package
  (`react` is reserved), but both are narrow enough to reimplement as custom rules
  inside `frontend/lint/eslint-plugin-metabase`, which does load. Same for the one
  `ttag` rule.

## Regenerating `.oxlintrc.json`

It was originally generated from the old `eslint.config.mjs` with `@oxlint/migrate`
and has since been hand-maintained. There is no longer an ESLint config to
regenerate from, so edit `.oxlintrc.json` directly.

`.oxlintrc.boundaries.json` is **generated and gitignored**. `bin/generate-oxlint-boundaries.mjs`
builds it from `.oxlintrc.json` plus `elements` and `enforcedRules` in
`frontend/lint/module-boundaries.mjs`, and `lint-boundaries` runs it first. It is a
full copy rather than an `extends` because `extends` does not inherit
`ignorePatterns`. It used to be hand-maintained and went stale silently across a
rebase, which is the failure mode generating it removes.

`enterprise/frontend/src/custom-viz/**` is excluded there: it carries its own empty
`.oxlintrc.json`, meaning the parent config does not apply, and passing `-c` bypasses
nested-config discovery.

## Verifying after changes

1. `bun run lint-oxlint` must report 0 on a clean tree.
2. `bun run lint-boundaries` must report 0.
3. When adding a rule, check it actually fires — a clean run is indistinguishable
   from a rule that silently does nothing. Write a fixture that violates it.
4. **Measure with a config file, never with `-D`/`--deny`.** On the CLI, a rule whose
   plugin is not active is silently ignored, so `-D i18next/no-literal-string`
   reports a clean tree for a plugin oxlint does not even implement. The same rule in
   a config file fails loudly (`Plugin 'i18next' not found`, `Rule 'x' not found in
   plugin 'import'`). Every "already clean" result measured with `-D` here turned out
   to be a false zero.
5. When measuring, beware the alias trap: oxlint reports
   `typescript/no-array-constructor` as `eslint(no-array-constructor)`. Grep the bare
   rule name, not the namespaced one.
6. Passing `-c` bypasses nested-config discovery, so `enterprise/frontend/src/custom-viz`
   (which has its own empty `.oxlintrc.json`) gets linted by the parent config and
   emits findings the real run never sees. Filter those out.
