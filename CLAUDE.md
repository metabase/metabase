# Metabase Development Guide

# Skills

For detailed guidance on writing and reviewing code and documentation, see the skills in [.claude/skills/](.claude/skills/):

## Clojure

### clojure-mcp tools

- **[clojure-eval](.claude/skills/clojure-eval/SKILL.md)** - Always use this to evaluate Clojure code, **run tests**, and verify edits/compile. Prefer this over shell commands.
- **[clojure-write](.claude/skills/clojure-write/SKILL.md)** - Clojure/ClojureScript development with REPL-driven workflow and coding conventions
- **[clojure-review](.claude/skills/clojure-review/SKILL.md)** - Clojure/ClojureScript code review guidelines and style enforcement

### clojure-mcp-lite tools

- **clj-nrepl-eval** - This is another good mechanism for running Clojure code on an nrepl server.

## TypeScript

- **[typescript-write](.claude/skills/typescript-write/SKILL.md)** - TypeScript/JavaScript development and best practices
- **[typescript-review](.claude/skills/typescript-review/SKILL.md)** - TypeScript/JavaScript code review guidelines

## Documentation

- **[docs-write](.claude/skills/docs-write/SKILL.md)** - Documentation writing with Metabase style guide
- **[docs-review](.claude/skills/docs-review/SKILL.md)** - Documentation review checklist

## Serialization

- **[serdes-workflow](.claude/skills/serdes-workflow/SKILL.md)** - Export, validate, and import Metabase content via serdes
- **[serdes-yaml-edit](.claude/skills/serdes-yaml-edit/SKILL.md)** - Edit exported YAML files with correct portable references

## Frontend

- **[analytics-events](.claude/skills/analytics-events/SKILL.md)** - Add product analytics events to track user interactions

**Important**: When working with frontend code, read [frontend/CLAUDE.md](frontend/CLAUDE.md) for project-specific guidelines on component preferences, styling, testing requirements, and available scripts.

## Running Backend Tests

If you do not have `clojure-eval` available to you or `clj-nrepl-eval`, do not fall back to `clj -X:dev:test` directly. Instead, use `./bin/test-agent`. It produces clean, plain-text output with no progress bars or ANSI codes.

```bash
./bin/test-agent :only '[metabase.foo-test]'              # run a namespace
./bin/test-agent :only '[metabase.foo-test/some-test]'    # run a single test
./bin/test-agent :only '[metabase.foo-test metabase.bar-test]'  # multiple namespaces
```

For module-scoped runs — useful when validating a branch's blast radius — pass `:module` (single) or `:modules` (vector) to scope tests to the module(s) the branch touched. The test runner resolves these to test directories: `enterprise/foo` → `enterprise/backend/test/metabase_enterprise/foo`, otherwise `test/metabase/<name>` (see `metabase.test-runner/parse-options`).

```bash
./bin/test-agent :module enterprise/workspaces
./bin/test-agent :modules '[sql-parsing query-processor]'
# Driver tests: --drivers=LIST adds the driver aliases and sets DRIVERS=LIST in one step.
./bin/test-agent --drivers=mysql,h2,postgres :module enterprise/workspaces
```

Once again, do not use `clj -X:dev:test` directly — its progress-bar output is hard to parse.

## Module Boundaries

The linter config at `.clj-kondo/config/modules/config.edn` records each module's `:api`, `:uses`,
`:model-exports`, and `:model-imports`. `metabase.core.modules-test` fails when it drifts from the source.

After **any** backend change that could shift module boundaries, regenerate it:

```bash
./bin/mage fix-modules-config
```

Changes that shift boundaries include: adding/removing/renaming a `src` namespace, adding or dropping a
cross-module `require` or `:model/X` reference, or creating a new module. When unsure, just run it — it is
a no-op (exits `unchanged`) when nothing drifted.

It piggybacks on a running dev nREPL (~5s) and auto-spawns a JVM if none is running (~15s). It only edits
the four generated keys; structural changes it can't safely make (a new module needs a human `:team`, or
modules need reordering) are printed as `WARNING:` lines for you to resolve by hand.

Run all repository-level checks, or one named suite:

```bash
./bin/mage project-tests
./bin/mage project-tests <backend|migrations|modules|ratchets>
```

### Nested modules

Module names form a tree: `lib.schema` is a child of `lib`. When OSS module `search` exists,
`enterprise/search` is its child. Run `./bin/mage modules-tree` to inspect the hierarchy.

- Namespace ownership uses the most specific matching prefix. Declaring `lib.schema` assigns
  `metabase.lib.schema.*` to it without moving files. Use `:ns-prefix` when namespaces do not match the
  module name.
- Every cross-module dependency still requires `:uses`.
- A child may use an ancestor's internal namespaces. Parents, siblings, and unrelated modules must use the
  target's `:api`.
- Each `:module-exports` entry widens a nested module's visibility by one ancestor. Export every link to
  make it available everywhere. OSS module `X` exports its `enterprise/X` companion automatically.

## Ratchets

After changing Clojure suppressions or module-boundary escape hatches, run `./bin/mage kondo-ratchets`.
Fix the underlying issue when possible; suppressions are a last resort and need a nearby explanation.

Explain budget increases in the PR. Do not record reductions in feature PRs: post-merge automation opens
a `Tighten ratchets` PR for them. Use `./bin/mage kondo-ratchets-shrink --seed :linter` only when adding an
inline-ignore budget. If either ratchet file conflicts, run `./bin/merge-kondo-ratchets`.

## Tool Preferences

If `clojure-mcp` tools are available, prefer them over shell-based alternatives for Clojure development.
