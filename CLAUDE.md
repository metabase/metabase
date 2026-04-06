# Metabase Development Guide

# Skills

For detailed guidance on writing and reviewing code and documentation, see the skills in [.claude/skills/](.claude/skills/):

## Clojure

- **[clojure-eval](.claude/skills/clojure-eval/SKILL.md)** - Always use this to evaluate Clojure code, **run tests**, and verify edits/compile. Prefer this over shell commands.
- **[clojure-write](.claude/skills/clojure-write/SKILL.md)** - Clojure/ClojureScript development with REPL-driven workflow and coding conventions
- **[clojure-review](.claude/skills/clojure-review/SKILL.md)** - Clojure/ClojureScript code review guidelines and style enforcement

## TypeScript

- **[typescript-write](.claude/skills/typescript-write/SKILL.md)** - TypeScript/JavaScript development and best practices
- **[typescript-review](.claude/skills/typescript-review/SKILL.md)** - TypeScript/JavaScript code review guidelines

## Documentation

- **[docs-write](.claude/skills/docs-write/SKILL.md)** - Documentation writing with Metabase style guide
- **[docs-review](.claude/skills/docs-review/SKILL.md)** - Documentation review checklist

## Frontend

- **[analytics-events](.claude/skills/analytics-events/SKILL.md)** - Add product analytics events to track user interactions

**Important**: When working with frontend code, read [frontend/CLAUDE.md](frontend/CLAUDE.md) for project-specific guidelines on component preferences, styling, TypeScript migration, testing requirements, and available scripts.

## Running Backend Tests

Use `./bin/test-agent` to run Clojure tests. It produces clean, plain-text output with no progress bars or ANSI codes.

```bash
./bin/test-agent :only '[metabase.foo-test]'              # run a namespace
./bin/test-agent :only '[metabase.foo-test/some-test]'    # run a single test
./bin/test-agent :only '[metabase.foo-test metabase.bar-test]'  # multiple namespaces
```

Do not use `clj -X:dev:test` directly — its progress-bar output is hard to parse.

## Tool Preferences

If `clojure-mcp` tools are available, prefer them over shell-based alternatives for Clojure development.
