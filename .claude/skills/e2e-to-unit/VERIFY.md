# verify.ts: coverage-scoped mutants for e2e-to-unit PRs

`verify.ts` checks, without an LLM, that the unit specs on a branch protect what the e2e tests it deleted protected. It writes the verify table for the PR description and a JSON file with the open rows.

```bash
bun .claude/skills/e2e-to-unit/verify.ts --out local/claude/verify.md --json local/claude/verify-open.json
```

With no other flags it reads the deleted `it()` titles from `git diff` against the merge base with `origin/master`, so a stale local `master` cannot widen the scope. The unit specs it runs are the ones the branch changed plus the spec that sits next to each product file in scope. That second half matters: a migration usually lands on specs it never touched, and a run that reads only the changed specs reports their coverage as a gap. It costs jest time, so `--no-siblings` turns it off. Pass `--test "<spec>::<it title>"` and `--unit-spec <path>` to name both sets yourself, for example before the e2e tests are deleted.

## How it works

1. **Scope.** The nightly `E2E Coverage Manifest` workflow runs the e2e suite against an instrumented frontend and records, for every `it()`, which product functions fired. The builder publishes that as `spec-test-functions.json` inside the `spec-file-manifest` artifact (30-day retention). `verify.ts` downloads it once, into `local/claude/e2e-coverage/<run id>/`, and falls back to the raw `coverage-shard-*` artifacts (7-day retention) for a run that predates the file. It then drops every function that 20% or more of all e2e tests fire (`--boot-threshold`). What is left is the code that the deleted test drove beyond boot: a median of about 200 functions in about 30 files.
2. **Map.** Each function is located by its start line at the nightly commit, shifted through `git diff -U0 <nightly sha>` onto the working tree, and matched to the function node that starts there. A function inside a changed hunk is reported as `changed since nightly`.
3. **Execute.** One jest run with `--coverageProvider=v8` over the unit specs says which of those functions they execute at all. The rest are `not executed` rows and need no further work.
4. **Mutate.** Each executed function gets up to `--per-function` mutants (default 4), chosen in this order: return `undefined`, `if` never takes its branch, ternary takes its second arm, a call statement is removed, a JSX prop becomes `undefined`, a string becomes empty. All mutants are compiled into the file once, each behind `globalThis.__E2E_MUTANT__ === <id>`, so the file still loads and behaves as the original.
5. **Run once.** A generated wrapper spec next to each unit spec overrides `it` and registers every test once per mutant with the switch set in the test body. Product modules load once per wrapper file, and jest spreads the `--wrappers` files (default 8, mutants dealt round-robin) over its workers. Each test runs under `--test-timeout` (default 25 s) so a mutant that stalls a `waitFor` cannot hold a worker for long. Keep it above the project's Testing Library `asyncUtilTimeout` (10 s here, set in `frontend/test/jest-setup-env.js`). When the two race, jest's timeout wins and the failure reads `Exceeded timeout` rather than `Unable to find`, which the judge then counts as an error rather than an assertion and discards a real kill. Failing pairs run again in a second jest run with one wrapper file per mutant, which gives each mutant its own module registry, so a leak between variants cannot fake a result.
6. **Judge.** A mutant is caught only by a test that passes on clean code, fails because its own code noticed the mutant when it is on, and does both again in the confirmation pass. A test notices either through a failed assertion or by crashing on the value the mutant produced, which is how a mutated hook that returns `undefined` reads: the spec throws on `result.current.data` before any `expect` runs. The deepest stack frame says which happened, so a throw from inside product code stays unmeasured, and so does a jest timeout.

Rows per function: `caught`, `survived` (executed but no test noticed any mutant), `not executed`, `unmeasured`, `no mutant`, `changed since nightly`, `unmapped`, `deleted by this branch`, `not on this branch` (the nightly instrumented it but the merge base has no such file either, so master grew it after the branch forked), `excluded` (`--exclude` prefixes, default `frontend/src/metabase/ui/`). The JSON output keeps the open rows: `survived`, `not executed`, `unmeasured`, `changed since nightly`, `unmapped`, `deleted by this branch`.

## Safety

The tool edits product files in the working tree while jest runs. It refuses to start when any of those files has uncommitted changes, restores them with `git checkout --` when it finishes or is interrupted, and deletes its wrapper specs (`__e2e_verify_*.unit.spec.*`). If a run is killed outright, `git status` shows the leftovers.

## Limits

- The function manifest describes the nightly's own commit. Functions inside a hunk of `git diff <nightly sha>` are reported as `changed since nightly` rather than mapped, so run it against a recent nightly.
- The nightly records that a function ran, not that an assertion depended on it. The mutants supply the assertion half, and an equivalent mutant can leave a false `survived` row. Read the detail column before treating a row as a gap.
- Functions that jsdom cannot reach (layout, scrolling, real focus) show as `not executed` and are keep signals for the e2e test, not gaps in the unit test.
- Only the spec beside a product file is found by name. A spec that covers a file from elsewhere, such as one that drives a plugin slot, needs `--unit-spec`.
- Shared chrome that the deleted test merely booted through sits below the boot threshold and still appears. Read the e2e share column: a row other suites own is not this branch's gap.

## Tests

```bash
bun test ./.claude/skills/e2e-to-unit/verify.test.ts
```

The `./` is needed because bun skips dot-directories in filters. CI does not run this file.
