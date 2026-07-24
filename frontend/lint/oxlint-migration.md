# Hybrid linting: oxlint + ESLint

We run **oxlint** (Rust, ~1.5s for the whole tree) for every rule it natively
supports, and keep **ESLint** only for the residual rules oxlint can't yet handle.
`eslint-plugin-oxlint` wires the two together so they never double-run and never
leave a gap.

## How it works

- `.oxlintrc.json` (repo root) — the oxlint config. It is the **single source of
  truth** for which rules oxlint owns. Generated from `eslint.config.mjs` with
  `@oxlint/migrate`, then hand-reconciled (see "Divergences" below).
- `eslint.config.mjs` ends with
  `configs.push(...oxlint.buildFromOxlintConfigFile(".oxlintrc.json"))`. This turns
  **off** in ESLint exactly the rules enabled in `.oxlintrc.json`. ESLint is left to
  enforce only the residual set.
- All three tools (`oxlint`, `@oxlint/migrate`, `eslint-plugin-oxlint`) are pinned to
  the **same** version (currently `^1.70.0`). Keep them in lockstep on upgrade.

## What runs where

- **oxlint** (`bun run lint-oxlint`): 126 native rules — the eslint recommended
  correctness set, most `react`/`react-hooks`/`import`/`jest`/`typescript` rules.
- **ESLint residual** (`bun run lint-eslint`): the 12 custom `metabase/*` rules,
  `boundaries`, `i18next`, `ttag`, `depend`, all `testing-library`/`jest-dom`/
  `cypress`/`storybook` rules (these need oxlint's still-alpha JS plugins), plus
  `strict`/`no-restricted-syntax`, plus the divergent rules below.
- Both run in `lint-staged` (pre-commit) and in CI (`fe-lint`). Because ESLint now
  skips oxlint-owned rules, **oxlint must run in every place ESLint does**, or those
  rules lose coverage.

## Divergences kept in ESLint (do not add to `.oxlintrc.json`)

These rules are intentionally **absent** from `.oxlintrc.json` because oxlint's
implementation is stricter than / differs from our ESLint config (each produced
false-positives that ESLint does not). ESLint remains their sole authority:

- `no-unused-vars` — oxlint conflates TS type-vs-value namespaces and misreads some
  `x++`/default-param uses.
- `import/no-duplicates` — oxlint doesn't treat `import type` as distinct from value
  imports.
- `react/display-name`, `jest/no-conditional-expect`, `no-unsafe-optional-chaining`,
  `no-array-constructor`, `no-console` — stricter/edge-case behavior than our config.

Two options were tuned rather than dropped, so they match ESLint exactly:
- `prefer-const` → `{ "destructuring": "all" }` (the migrate tool dropped the option).
- `no-redeclare` → `{ "builtinGlobals": false }` (matches ESLint's default).

## Verifying equivalence after changes

1. `bun run lint-oxlint` must report **0** on a clean tree.
2. Spot-check parity on files that violate migrated rules: run
   `oxlint --format=json` and `eslint -f json`, normalize to `(file,line,col,rule)`
   and diff. Any oxlint finding on a file ESLint reports clean is a divergence —
   either tune the option in `.oxlintrc.json` or move the rule to the residual above.
3. `eslint --print-config <file>` should show oxlint-owned rules as `0` (off) and
   residual rules as `1`/`2` (on).

## Regenerating `.oxlintrc.json`

```
bunx @oxlint/migrate@<oxlint-version> --js-plugins=false --output-file .oxlintrc.json eslint.config.mjs
```

After regenerating, re-apply these reconciliations (the migrate tool gets them wrong),
then run `bun run lint-parity` + `bun run lint-oxlint`:

1. **Divergent rules** — remove the rules listed under "Divergences" above, and re-tune
   `prefer-const` / `no-redeclare` options.
2. **Globals → `env`** — the migrate tool expands `globals.browser`/`globals.node` into
   huge literal maps (~1100 entries). Replace each override's `globals` with the
   matching `env` flag (`browser`/`node`); keep `es2020`/`commonjs`/`jest`. oxlint
   resolves real globals from `env` (verified: `env.browser` defines `window` so
   `no-undef` doesn't fire).
3. **Ignore patterns** — oxlint respects `.gitignore` automatically, so drop the
   patterns already covered by it (`node_modules/**`, `**/target/**`, `.shadow-cljs/**`,
   `e2e/tmp/**`, `frontend/src/cljs{,_release}/**`). Keep patterns for tracked files
   (`**/*.d.ts`, `resources/**`, `**/dist/**`, `**/__snapshots__/**`, the custom-viz
   fixtures, and the `!.storybook/**` negation).
