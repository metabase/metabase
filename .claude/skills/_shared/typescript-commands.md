## Linting and Formatting

- **Lint:** `bun run lint-oxlint`
  - Run oxlint on the codebase
- **Format:** `bun run format`
  - Format code with oxfmt (`oxfmt --write`); use `bun run lint-format-pure` to check without writing
- **Type Check:** `bun run type-check-pure`
  - Run TypeScript type checking

`type-check` and `test-unit` rebuild ClojureScript first, and `lint-format` runs `bun install` first. When you only need the check, use `type-check-pure`, `lint-format-pure`, or `test-unit-keep-cljs`.

## Testing

### JavaScript/TypeScript Tests

These reuse existing compiled ClojureScript output:

- **Test specific files:** `bun run test-unit-keep-cljs --runInBand --runTestsByPath path/to/file.unit.spec.tsx`
  - Use explicit Jest path flags. A bare positional path can be consumed by `--ignoreProjects` in this script and launch an unintended broad run.
- **Test by name within specific files:** `bun run test-unit-keep-cljs --runInBand --runTestsByPath path/to/file.unit.spec.tsx -t "pattern"`
  - Runs matching test names only within the specified files.

### Faster runner for the same specs

`bun run test-unit-agent-keep-cljs` runs the same unit specs through jest on a second runner that is about twice
as fast as jest's own. Prefer it while you work. CI runs the same runner on pull requests and jest's own runner on
master, so if the two disagree, trust jest.

- **Test specific files:** `bun run test-unit-agent-keep-cljs path/or/pattern [more patterns]`
  - Each argument is a regular expression matched against the spec's path
- **Test by name:** `bun run test-unit-agent-keep-cljs path/or/pattern -t "pattern"`
- **Stop at the first failing file:** add `--bail`
- **Build cljs first:** `bun run test-unit-agent` (needed once per checkout, and after a cljs change)

The output is short on purpose. jest names its projects first, and a passing run then prints one line. Read it
like this:

- `FAIL <file>:<line> > <test>` and an indented message: one failing test. The path after `detail:` is a file
  with the full message, stack and console output. Read it only if the short message is not enough.
- `SUMMARY files=… passed=… failed=… skipped=…`: the counts.
- `RERUN <command>`: the command that runs only the failed files again.

A test can fail because of a spec file that ran before it in the same worker. If a test fails in a whole run and
passes when you run its file with `RERUN`, it is not a failure of the code under test. Mention it in your report,
and do not try to fix it.

More in `frontend/test/harness/README.md`.

### ClojureScript Tests

- **Test ClojureScript:** `bun run test-cljs`
  - Run ClojureScript tests
