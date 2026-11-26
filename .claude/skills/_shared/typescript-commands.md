## Linting and Formatting

- **Lint:** `bun run lint-oxlint-pure`
  - Run oxlint on the codebase
- **Format:** `bun run format`
  - Format code with oxfmt (`oxfmt --write`); use `bun run lint-format-pure` to check without writing
- **Type Check:** `bun run type-check-pure`
  - Run TypeScript type checking

`lint-oxlint`, `type-check` and `test-unit` rebuild ClojureScript first, and `lint-format` runs `bun install` first. When you only need the check, use `lint-oxlint-pure`, `type-check-pure`, `lint-format-pure`, or `test-unit-keep-cljs`.

## Testing

### JavaScript/TypeScript Tests

These reuse existing compiled ClojureScript output and run through jest on the runner in `frontend/test/harness`:

- **Test specific files:** `bun run test-unit-keep-cljs path/or/pattern [more patterns]`
- **Test by name within specific files:** `bun run test-unit-keep-cljs path/or/pattern -t "pattern"`

### jest's own runner

`bun run test-unit-jest-keep-cljs --runInBand --runTestsByPath path/to/file.unit.spec.tsx` runs a spec on jest's own
runner. Use explicit Jest path flags. A bare positional path can be consumed by `--ignoreProjects` in this script and
launch an unintended broad run. Coverage needs this runner.

### Short output for agents

`bun run test-unit-agent-keep-cljs` runs the specs on the same runner as `test-unit-keep-cljs`, about twice as fast as
jest's own, with short output. Prefer it while you work. CI runs this runner on pull requests, and both runners on
pushes to master and release branches. If the two disagree, trust jest.

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

A message that starts with "An async" or "An act() that a waitFor started" is different: the failing test itself
left an `act()` or a `waitFor` running when it ended. Fix that test as the message says.

More in `frontend/test/harness/README.md`.

### ClojureScript Tests

- **Test ClojureScript:** `bun run test-cljs`
  - Run ClojureScript tests
