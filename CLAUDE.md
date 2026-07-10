# Metabase Development Guide

# Skills

For detailed guidance on writing and reviewing code and documentation, see the skills in [.claude/skills/](.claude/skills/):

## Clojure

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

## Tool Preferences

If `clojure-mcp` tools are available, prefer them over shell-based alternatives for Clojure development.
