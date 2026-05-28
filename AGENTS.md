# Metabase Development Guide

# Skills

For detailed guidance on writing and reviewing code and documentation, see the skills in [.Codex/skills/](.Codex/skills/):

## Clojure

### clojure-mcp tools

- **[clojure-eval](.Codex/skills/clojure-eval/SKILL.md)** - Always use this to evaluate Clojure code, **run tests**, and verify edits/compile. Prefer this over shell commands.
- **[clojure-write](.Codex/skills/clojure-write/SKILL.md)** - Clojure/ClojureScript development with REPL-driven workflow and coding conventions
- **[clojure-review](.Codex/skills/clojure-review/SKILL.md)** - Clojure/ClojureScript code review guidelines and style enforcement

### clojure-mcp-lite tools

- **clj-nrepl-eval** - This is another good mechanism for running Clojure code on an nrepl server.

## TypeScript

- **[typescript-write](.Codex/skills/typescript-write/SKILL.md)** - TypeScript/JavaScript development and best practices
- **[typescript-review](.Codex/skills/typescript-review/SKILL.md)** - TypeScript/JavaScript code review guidelines

## Documentation

- **[docs-write](.Codex/skills/docs-write/SKILL.md)** - Documentation writing with Metabase style guide
- **[docs-review](.Codex/skills/docs-review/SKILL.md)** - Documentation review checklist

## Serialization

- **[serdes-workflow](.Codex/skills/serdes-workflow/SKILL.md)** - Export, validate, and import Metabase content via serdes
- **[serdes-yaml-edit](.Codex/skills/serdes-yaml-edit/SKILL.md)** - Edit exported YAML files with correct portable references

## Frontend

- **[analytics-events](.Codex/skills/analytics-events/SKILL.md)** - Add product analytics events to track user interactions

**Important**: When working with frontend code, read [frontend/AGENTS.md](frontend/AGENTS.md) for project-specific guidelines on component preferences, styling, TypeScript migration, testing requirements, and available scripts.

## Running Backend Tests

If you do not have `clojure-eval` available to you or `clj-nrepl-eval`, do not fall back to `clj -X:dev:test` directly. Instead, use `./bin/test-agent`. It produces clean, plain-text output with no progress bars or ANSI codes.

```bash
./bin/test-agent :only '[metabase.foo-test]'              # run a namespace
./bin/test-agent :only '[metabase.foo-test/some-test]'    # run a single test
./bin/test-agent :only '[metabase.foo-test metabase.bar-test]'  # multiple namespaces
```

Once again, do not use `clj -X:dev:test` directly — its progress-bar output is hard to parse.

## Tool Preferences

If `clojure-mcp` tools are available, prefer them over shell-based alternatives for Clojure development.
