# Metabase Clojure Style Guide

This guide covers Clojure and ClojureScript coding conventions for Metabase. See also: `CLOJURE_STYLE_GUIDE.adoc` for the Community Clojure Style Guide.

## Naming Conventions

**General Naming:**

- Acceptable abbreviations: `acc`, `i`, `pred`, `coll`, `n`, `s`, `k`, `f`
- Use `kebab-case` for all variables, functions, and constants

**Function Naming:**

- Pure functions should be nouns describing the value they return (e.g., `age` not `calculate-age` or `get-age`)
- Functions with side effects must end with `!`
- Don't repeat namespace alias in function names

**Destructuring:**

- Map destructuring should use kebab-case local bindings even if the map uses `snake_case` keys

## Documentation Standards

**Docstrings:**

- Every public var in `src` or `enterprise/backend/src` must have docstring
- Format using Markdown conventions
- Reference other vars with `[[other-var]]` not backticks

**Comments:**

- `TODO` format: `;; TODO (Name YYYY-MM-DD) -- description`

## Code Organization

**Visibility:**

- Make everything `^:private` unless it is used elsewhere
- Try to organize namespaces to avoid `declare` (put public functions near the end)

**Size and Structure:**

- Break up functions > 20 lines
- Lines ≤ 120 characters
- No blank non-comment lines within definition forms (except pairwise `let`/`cond`)

## Style Conventions

**Keywords and Metadata:**

- Prefer namespaced keywords for internal use: `:query-type/normal` not `:normal`
- Tag variables with `:arglists` metadata if they're functions but wouldn't otherwise have it

## Tests

**Organization:**

- Break large tests into separate `deftest` forms for logically separate test cases
- Test names should end in `-test` or `-test-<number>`

**Performance:**

- Mark pure function tests `^:parallel`

## Modules

**OSS Modules:**

- Follow `metabase.<module>.*` pattern
- Source in `src/metabase/<module>/`

**Enterprise Modules:**

- Follow `metabase-enterprise.<module>.*` pattern
- Source in `enterprise/backend/src/metabase_enterprise/<module>/`

**Module Structure:**

- REST API endpoints go in `<module>.api` or `<module>.api.*` namespaces
- Put module public API in `<module>.core` using Potemkin imports
- Put Toucan models in `<module>.models.*`
- Put settings in `<module>.settings`
- Put schemas in `<module>.schema`

**Module Linters:**

- Do not cheat module linters with `:clj-kondo/ignore [:metabase/modules]`

## REST API Endpoints

**Required Elements:**

- All new endpoints must have response schemas (`:- <schema>` after route string)
- All endpoints need Malli schemas for parameters (detailed and complete)
- All new REST API endpoints MUST HAVE TESTS

**Naming Conventions:**

- Query parameters use kebab-case
- Request bodies use `snake_case`
- Routes use singular nouns (e.g., `/api/dashboard/:id`)

**Behavior:**

- `GET` endpoints should not have side effects (except analytics)
- `defendpoint` forms should be small wrappers around Toucan model code

## MBQL (Metabase Query Language)

**Restrictions:**

- No raw MBQL introspection outside of `lib`, `lib-be`, or `query-processor` modules
- Use Lib and MBQL 5 in new source code; avoid legacy MBQL

## Database and Models

**Naming:**

- Model names and table names should be singular nouns
- Application database uses `snake_case` identifiers

**Best Practices:**

- Use `t2/select-one-fn` instead of fetching entire rows for one column
- Put correct behavior in Toucan methods, not separate helper functions

## Drivers

**Documentation:**

- New driver multimethods must be mentioned in `docs/developers-guide/driver-changelog.md`

**Implementation:**

- Driver implementations should pass `driver` argument to other driver multimethods
- Don't hardcode driver names in implementations
- Minimize logic inside `read-column-thunk` in JDBC-based drivers

## Miscellaneous

**Examples:**

- Example data should be bird-themed if possible

**Linter Suppressions:**

- Use proper format for kondo suppressions
- No `#_:clj-kondo/ignore` (keyword form)

**Configurable Options:**

- Don't define configurable options that can only be set with environment variables
- Use `:internal` `defsetting` instead
