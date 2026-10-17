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

`bun run test-unit-harness-keep-cljs` runs the same unit specs on a second runner that is about twice as fast
as jest. Prefer it while you work. jest is still what CI requires, so if the two disagree, trust jest.

- **Test specific files:** `bun run test-unit-harness-keep-cljs path/or/pattern [more patterns]`
  - Each argument is a regular expression matched against the spec's path
- **Test by name:** `bun run test-unit-harness-keep-cljs path/or/pattern -t "pattern"`
- **Stop at the first failing file:** add `--bail`
- **Build cljs first:** `bun run test-unit-harness` (needed once per checkout, and after a cljs change)

The output is short on purpose. A passing run prints one line. Read it like this:

- `FAIL <file>:<line> > <test>` and an indented message: one failing test. The path after `detail:` is a file
  with the full message, stack and console output. Read it only if the short message is not enough.
- `ALONE pass <file> > <test>`: this test failed in the run but passed when its file ran again alone. It is
  not a failure of the code under test. Mention it in your report, and do not try to fix it.
- `SUMMARY files=… passed=… failed=… skipped=…`: the counts. With `failed_alone=0` the exit code is 0.
- `RERUN <command>`: the command that runs only the failed files again.

More in `frontend/test/harness/README.md`.

### ClojureScript Tests

- **Test ClojureScript:** `bun run test-cljs`
  - Run ClojureScript tests
