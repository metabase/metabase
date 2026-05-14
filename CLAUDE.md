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

**Important**: When working with frontend code, read [frontend/CLAUDE.md](frontend/CLAUDE.md) for project-specific guidelines on component preferences, styling, TypeScript migration, testing requirements, and available scripts.

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

## Tool Preferences

If `clojure-mcp` tools are available, prefer them over shell-based alternatives for Clojure development.

## Writing Docstrings

A docstring is a contract for the *caller*, not a diary for the
implementer. It states what the function does, what it takes, returns,
throws, and the preconditions/invariants the caller must respect. Those
guarantees and requirements *belong* there — they are exactly what the
caller needs surfaced in the IDE.

When you find implementation context in a docstring, the default is to
**relocate it, not delete it** — move it to an inline comment at the
point in the body where it is actually relevant. That context is often
genuinely valuable; it is just in the wrong place (the caller should not
have to read it; the implementer standing at that line should). Delete
outright only when it is blather: self-congratulation, restating the
obvious, or documenting a property that is the expected default.

On that last case — narrating properties like "portable across all
supported appdbs" earns no sentence. If it were not portable, that is
either a bug, or it means callers must handle each case themselves — and
in *that* case it is the *absence* of the property that must be
documented. Document deviations from expectation, not conformance to it.

Heuristic: if a sentence would still be true after a full rewrite of the
body, it may belong in the docstring. If it describes *how the current
body works*, it belongs in the body — as an inline comment, if it is
non-obvious.

Multi-line docstrings are not banned — a genuinely non-obvious constraint
the code had to deal with can be worth explaining. But be prudent; the
failure mode is far too much detail. When tempted to write a
multi-paragraph explanatory docstring, check with the user first. And
prefer a *test* to prose: if a future reader thinks "that's a silly way
to do it" and changes it, a test should fail and tell them why. If that
breakage keeps happening, *that* is the signal a comment was warranted.
