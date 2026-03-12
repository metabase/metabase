# Coding Conventions

**Analysis Date:** 2026-03-11

## Dual Language Codebase

Metabase is a dual-language project: **Clojure** (backend) and **TypeScript/React** (frontend). Each has distinct conventions documented below. Follow the conventions for the language you are working in.

## TypeScript/React Naming Patterns

**Files:**
- Components: `PascalCase.tsx` (e.g., `TimeInput.tsx`)
- Utilities: `camelCase.ts` or `kebab-case.ts` (e.g., `utils.ts`)
- Tests: `ComponentName.unit.spec.tsx` or `util-name.unit.spec.ts`
- CSS Modules: `ComponentName.module.css`
- Stories: `ComponentName.stories.tsx`
- Barrel exports: `index.ts`

**Functions:**
- Use `camelCase` for all functions and variables
- React components use `PascalCase`
- Event handlers: prefix with `handle` (e.g., `handleChange`, `handleBlur`)
- Custom hooks: prefix with `use` (e.g., `useStore`, `useSdkSelector`)

**Types/Interfaces:**
- Use `PascalCase` for types and interfaces
- Props interfaces: `ComponentNameProps` (e.g., `TimeInputProps`)
- Setup options in tests: `SetupOpts`

**Variables:**
- Unused variables: prefix with `_` (e.g., `_unused`) -- enforced by ESLint
- Constants: `UPPER_SNAKE_CASE` (e.g., `TIME_FORMAT`, `MOCK_CARD_ENTITY_ID`)

## Clojure Naming Patterns

**Namespaces:**
- OSS: `metabase.<module>.*` (source in `src/metabase/<module>/`)
- Enterprise: `metabase-enterprise.<module>.*` (source in `enterprise/backend/src/metabase_enterprise/<module>/`)
- Tests: append `-test` to namespace (e.g., `metabase.geojson.api-test`)

**Functions:**
- Use `kebab-case` for all variables and functions
- Pure functions: name as nouns describing return value (e.g., `age` not `calculate-age`)
- Side-effect functions: end with `!` (e.g., `update-db!`, `save-model!`)
- Do NOT repeat namespace alias in function names
- Acceptable abbreviations: `acc`, `i`, `pred`, `coll`, `n`, `s`, `k`, `f`

**Keywords:**
- Prefer namespaced keywords for internal use: `:query-type/normal` not `:normal`

**Destructuring:**
- Map destructuring: use `kebab-case` local bindings even if map uses `snake_case` keys

## Code Style

**TypeScript Formatting:**
- Formatter: Prettier with `{ "trailingComma": "all" }`
- Linter: ESLint 9 (flat config at `eslint.config.mjs`)
- Run formatting: `bun run prettier`
- Run lint: `bun run lint-eslint-pure`
- Run type check: `bun run type-check-pure`
- Max line complexity: 55
- `curly: "all"` -- always use braces
- `eqeqeq: "smart"` -- use strict equality
- `prefer-const` with `destructuring: "all"`
- No `console.log` (only `console.warn`, `console.error` allowed)

**Clojure Formatting:**
- Formatter: `cljfmt` via `./bin/mage cljfmt-files [path]`
- Linter: clj-kondo via `./bin/mage kondo <file>` or `./bin/mage kondo-updated <branch>`
- Lines <= 120 characters
- Functions under 20 lines when possible
- No blank non-comment lines within definition forms (except pairwise `let`/`cond`)
- Always set `*warn-on-reflection*` to true in test files
- End all files with a newline
- Keep tabular code columns aligned

**CSS:**
- Linter: Stylelint (`stylelint.config.mjs`)
- ALWAYS prefer Mantine style props, then CSS modules. DO NOT use styled components (deprecated)
- Do not use `@emotion/styled` or `@emotion/react` -- use CSS modules instead
- Do not use base colors (`mb-base-color-*`) in application code -- use semantic colors

## Import Organization

**TypeScript Import Order (enforced by ESLint):**
1. Built-in modules (node built-ins)
2. External packages (react, @mantine, etc.)
3. Internal modules (metabase/*, metabase-lib/*, etc.)
4. Parent imports (`../`)
5. Sibling imports (`./`)
6. Index imports

**Key rules:**
- Newlines between groups (enforced)
- Alphabetical sort within groups (enforced)
- Use `type` imports for type-only imports: `import { type Card } from "metabase-types/api"`
- Consistent type imports with inline style: `@typescript-eslint/consistent-type-imports`

**Path Aliases (from `tsconfig.json`):**
- `metabase/*` -> `frontend/src/metabase/*`
- `metabase-lib/*` -> `frontend/src/metabase-lib/*`
- `metabase-types/*` -> `frontend/src/metabase-types/*`
- `__support__/*` -> `frontend/test/__support__/*`
- `cljs/*` -> `target/cljs_dev/*`
- `build-configs/*` -> `frontend/build/*`

**Clojure Import Order:**
- `:require` block with alphabetically sorted namespaces
- `:import` block for Java classes
- Use namespace aliases, not full paths

## Restricted Imports (Enforced by ESLint)

- Import from `metabase/ui` NOT from `@mantine/core`
- Import `useSelector`/`useDispatch`/`connect` from `metabase/lib/redux` NOT from `react-redux`
- SDK code: use `useSdkSelector`/`useSdkDispatch` NOT `useSelector`/`useDispatch`
- Do NOT import from `metabase-enterprise` in OSS code
- Do NOT import from `cljs/metabase.lib*` directly
- Do NOT import `@storybook/test` -- use `@testing-library/react` or `@testing-library/user-event`

**Default Exports:**
- `import/no-default-export: "error"` -- no default exports except in stories and storybook preview files

## Error Handling

**TypeScript:**
- Use `try/catch` with typed errors
- API errors handled through fetch-mock in tests (unmocked routes cause test failures)

**Clojure:**
- Use `ex-info` for creating exceptions with data maps
- Use `is` assertions in tests with descriptive messages via `testing` blocks
- API endpoint errors return structured error responses with appropriate HTTP status codes

## Logging

**TypeScript:**
- No `console.log` in production code (ESLint error)
- `console.warn` and `console.error` are allowed
- E2E tests can use `console` freely

**Clojure:**
- Use `metabase.util.log` for logging (not `println`)

## Comments

**TypeScript:**
- JSDoc for complex functions and public APIs
- Inline comments for non-obvious logic

**Clojure:**
- TODO format: `;; TODO (Name YYYY-MM-DD) -- description` (author and date REQUIRED)
- Every public var in `src` or `enterprise/backend/src` MUST have a docstring
- Docstrings use Markdown conventions
- Reference other vars with `[[other-var]]` not backticks
- Kondo suppressions: use `^:clj-kondo/ignore` metadata form, not `#_:clj-kondo/ignore`

## Component Design (React)

**Preferred patterns:**
- Use `metabase/ui` components (built on Mantine v8) over `metabase/common/components`
- Use `.tsx` for components, `.ts` for utilities
- Use function declarations for components (not arrow functions)
- Functional components only (no class components)

**Component file structure:**
```
ComponentName/
  index.ts              # Barrel export
  ComponentName.tsx     # Component implementation
  ComponentName.module.css  # Styles (CSS Modules)
  ComponentName.unit.spec.tsx  # Tests
  ComponentName.stories.tsx    # Storybook stories (optional)
  ComponentName.config.tsx     # Mantine theme overrides (optional)
  ComponentName.mdx           # Documentation (optional)
```

**Enterprise Features:**
- Enterprise functionality MUST use the plugin system
- Never expose enterprise code in the OSS version
- Enterprise frontend code lives in `enterprise/frontend/src/`

## Localization

- ALL user-facing strings MUST be localized using the `ttag` library
- Localized strings should be complete phrases -- do NOT concatenate separately localized strings
- Add context to ambiguous strings (e.g., "Home" could mean dwelling vs. landing page)
- Enforced by `ttag/no-module-declaration` ESLint rule and `i18next/no-literal-string` rule

## REST API Conventions (Clojure)

- Query parameters: `kebab-case`
- Request bodies: `snake_case`
- Routes: singular nouns (e.g., `/api/dashboard/:id` NOT `/api/dashboards/:id`)
- All endpoints MUST have response schemas (`:- <schema>` after route string)
- All endpoints MUST have Malli schemas for parameters
- `GET` endpoints: no side effects (except analytics)
- `defendpoint` forms: small wrappers around Toucan model code
- All new REST API endpoints MUST have tests

## Module Structure (Clojure)

- REST API endpoints: `<module>.api` or `<module>.api.*` namespaces
- Public API: `<module>.core` using Potemkin imports
- Toucan models: `<module>.models.*`
- Settings: `<module>.settings`
- Schemas: `<module>.schema`
- Make everything `^:private` unless used elsewhere
- Avoid `declare` -- put public functions near end of namespace

## Database Conventions (Clojure)

- Model and table names: singular nouns
- Application database: `snake_case` identifiers
- Use `t2/select-one-fn` instead of fetching full rows for one column
- Put correct behavior in Toucan methods, not helper functions

## Development Workflow

- Add failing tests first, then fix them
- Work in small, testable increments
- Run targeted tests and lint continuously
- Prioritize understanding existing patterns before implementing
- When heavily editing `.js`/`.jsx` files, create a separate PR to convert to TypeScript first

## Pre-commit Hooks

- Husky runs `lint-staged` on pre-commit (via `.husky/pre-commit`)
- Also runs a pre-commit hook that checks for debug markers

---

*Convention analysis: 2026-03-11*
