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

## Kondo Ignore Ratchets

`.clj-kondo/ratchets.edn` records, per linter, how many inline `:clj-kondo/ignore` forms the backend source
tree may contain, and how many config-level suppressions (`:off` switches and `:exclude` entries in
`.clj-kondo/config.edn`) exist. Each `:ignore-counts` value is either a non-negative integer ceiling or
`:unlimited`, which has no ceiling. This count policy is independent of `:comment-exempt`, described below.

Both ratchet commands are quick Babashka tasks, not JVM test runs:

```bash
./bin/mage kondo-ratchets                       # validate the file without changing it
./bin/mage kondo-ratchets-shrink [--seed :lint] # lower budgets; optionally seed one
```

`kondo-ratchets` is the command CI runs. It rejects suppression counts above their budgets, ignores without
required justification comments, unknown linter names, and a missing or incorrectly formatted ratchets
file. It allows budgets above the current counts.

`kondo-ratchets-shrink` lowers budgets to the current counts and normalizes the file. It is the only Mage
command that writes the file. With `--seed`, it can also add or raise an inline-ignore budget.

Every policy key must name a linter: one of the pinned clj-kondo version's built-ins, a linter configured
under `.clj-kondo/`, or an external diagnostic such as `:clojure-lsp/unused-public-var`. Both commands
reject unknown names rather than dropping them.

Release branches disable ratchet enforcement by replacing `.clj-kondo/ratchets.edn` with
`{:disabled true}`. Both commands recognize this explicit opt-out; a missing file remains an error.

When you remove ignores, leave the higher budget unchanged on the feature branch. After the change lands,
the shrink workflow opens a `Tighten ratchets` PR to record the reduction. Avoiding ratchet-file changes in
feature PRs also prevents unrelated PRs from conflicting over the file. The shrinker removes a bounded
budget when its count reaches zero. It preserves an unused `:unlimited` entry and prints a warning so that
the entry can be reviewed and removed manually on `master`.

When you add a necessary ignore, run `./bin/mage kondo-ratchets-shrink --seed :the-linter` and explain the
budget increase in the PR. Use `:unlimited` only when future ignores for that linter should not require
budget changes.

Fix the underlying warning when possible. Adding a suppression is a last resort and requires approval.
In every suppression map, `:clj-kondo/ignore` must be the first key. Unless every suppressed linter is in
`:comment-exempt`, add a `;;` comment directly above the suppression or at the end of the same line to
explain why it is necessary. The check reports missing comments.
When a linter's last uncommented ignore is commented or removed, the check warns that its exemption is
stale. Remove the entry by hand; nothing does so automatically. Like `:unlimited`, an exemption records a
decision rather than a count.

Introducing a new linter: `./bin/mage kondo-insert-ignores :the-linter` inserts an ignore at every site it
flags, then `./bin/mage kondo-ratchets-shrink --seed :the-linter` records the budget. This lets the linter
land without fixing all its existing findings at once.

To burn debt down, `./bin/mage kondo-redundant-ignores` lists ignores that are no longer needed (slow:
full kondo run). Kondo's redundancy report can't see hook-linter warnings, so `--fix` re-lints after
removing, puts any still-working ignore back exactly as it was, and stamps it with a `[kondo-keep]`
comment; marked sites are skipped on later runs. That verification needs a clean starting point, so
files with pre-existing lint findings are excluded from the sweep and reported. `--fix --audit` rechecks the
marked sites too, removing any that have become truly redundant along with their stamped marker
comments (a marker trailing on a code line is left for a hand fix). `[kondo-keep]` can also be added
by hand to protect an ignore whose exact form matters — it only counts on the line directly above the
ignore, or trailing on the ignore's own line.

If `.clj-kondo/ratchets.edn` conflicts during a merge, rebase, or restack, run
`./bin/merge-kondo-ratchets`. A change on one side wins over an unchanged base. When both sides change
the same policy, the tool chooses the smaller budget, a numeric budget over `:unlimited`, or a removed
entry over either. A file deleted on one side and changed on the other is left for you to resolve.

## Tool Preferences

If `clojure-mcp` tools are available, prefer them over shell-based alternatives for Clojure development.
