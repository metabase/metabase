---
name: clojure-review
description: Review Clojure and ClojureScript code changes for compliance with Metabase coding standards, style violations, and code quality issues. Use when reviewing pull requests or diffs containing Clojure/ClojureScript code.
allowed-tools: Read, Grep, Bash, Glob
---

# Clojure Code Review Skill

@./../_shared/clojure-style-guide.md
@./../_shared/clojure-commands.md

## Review guidelines

**What to flag:**

- Check compliance with the Metabase Clojure style guide (included above)
- If `CLOJURE_STYLE_GUIDE.adoc` exists in the working directory, also check compliance with the community Clojure style guide
- Flag all style guide violations

**What NOT to post:**

- Do not post comments congratulating someone for trivial changes or for following style guidelines
- Do not post comments confirming things "look good" or telling them they did something correctly
- Only post comments about style violations or potential issues

Example bad code review comments to avoid:

> This TODO comment is properly formatted with author and date - nice work!

> Good addition of limit 1 to the query - this makes the test more efficient without changing its behavior.

> The kondo ignore comment is appropriately placed here

> Test name properly ends with -test as required by the style guide.

**Special cases:**

- Do not post comments about missing parentheses (these will be caught by the linter)

## Quick review checklist

Use this to scan through changes efficiently:

### Naming

- [ ] Descriptive names (no `tbl`, `zs'`)
- [ ] Pure functions named as nouns describing their return value
- [ ] `kebab-case` for all variables and functions
- [ ] Side-effect functions end with `!`
- [ ] No namespace-alias repetition in function names

### Documentation

- [ ] Public vars in `src` or `enterprise/backend/src` have useful docstrings
- [ ] Docstrings use Markdown conventions
- [ ] References use `[[other-var]]` not backticks
- [ ] `TODO` comments include author and date: `;; TODO (Name 1/1/25) -- description`

### Code Organization

- [ ] Everything `^:private` unless used elsewhere
- [ ] No `declare` when avoidable (public functions near end)
- [ ] Functions under 20 lines when possible
- [ ] No blank, non-comment lines within definition forms (except pairwise constructs in `let`/`cond`)
- [ ] Lines ≤ 120 characters

### Tests

- [ ] Separate `deftest` forms for distinct test cases
- [ ] Pure tests marked `^:parallel`
- [ ] Test names end in `-test` or `-test-<number>`

### Modules

- [ ] Correct module patterns (OSS: `metabase.<module>.*`, EE: `metabase-enterprise.<module>.*`)
- [ ] API endpoints in `<module>.api` namespaces
- [ ] Public API in `<module>.core` with Potemkin
- [ ] No cheating module linters with `:clj-kondo/ignore [:metabase/modules]`

### REST API

- [ ] Response schemas present (`:- <schema>`)
- [ ] Query params use kebab-case, bodies use `snake_case`
- [ ] Routes use singular nouns (e.g., `/api/dashboard/:id`)
- [ ] `GET` has no side effects (except analytics)
- [ ] Malli schemas detailed and complete
- [ ] All new endpoints have tests

### MBQL

- [ ] No raw MBQL manipulation outside `lib`, `lib-be`, or `query-processor` modules
- [ ] Uses Lib and MBQL 5, not legacy MBQL

### Database

- [ ] Model and table names are singular nouns
- [ ] Uses `t2/select-one-fn` instead of selecting full rows for one column
- [ ] Logic in Toucan methods, not helper functions

### Drivers

- [ ] New multimethods documented in `docs/developers-guide/driver-changelog.md`
- [ ] Passes `driver` argument to other driver methods (no hardcoded driver names)
- [ ] Minimal logic in `read-column-thunk`

### Miscellaneous

- [ ] Example data is bird-themed when possible
- [ ] Kondo linter suppressions use proper format (not `#_:clj-kondo/ignore` keyword form)

## Pattern matching table

Quick scan for common issues:

| Pattern                                      | Issue                                                       |
| -------------------------------------------- | ----------------------------------------------------------- |
| `calculate-age`, `get-user`                  | Pure functions should be nouns: `age`, `user`               |
| `update-db`, `save-model`                    | Missing `!` for side effects: `update-db!`, `save-model!`   |
| `snake_case_var`                             | Should use kebab-case                                       |
| Public var without docstring                 | Add docstring explaining purpose                            |
| `;; TODO fix this`                           | Missing author/date: `;; TODO (Name 1/1/25) -- description` |
| `(defn foo ...)` in namespace used elsewhere | Should be `(defn ^:private foo ...)`                        |
| Function > 20 lines                          | Consider breaking up into smaller functions                 |
| `/api/dashboards/:id`                        | Use singular: `/api/dashboard/:id`                          |
| Query params with `snake_case`               | Use kebab-case for query params                             |
| New API endpoint without tests               | Add tests for the endpoint                                  |

## Feedback format examples

**For style violations:**

> This pure function should be named as a noun describing its return value. Consider `user` instead of `get-user`.

**For missing documentation:**

> This public var needs a docstring explaining its purpose, inputs, and outputs.

**For organization issues:**

> This function is only used in this namespace, so it should be marked `^:private`.

**For API conventions:**

> Query parameters should use kebab-case. Change `user_id` to `user-id`.
