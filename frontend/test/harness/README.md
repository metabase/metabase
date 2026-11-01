# The node:test runner for the unit specs

This directory holds a jest runner for the frontend unit specs. jest selects
the spec files and reports the results, as always. The runner runs the files on
`node:test`, in a pool of its own workers, and gives the same results as jest's
own runner in about half the time. jest's own runner stays the reference. If
the two disagree about a spec, jest's own runner is right and the difference is
a bug here.

## Run it

```sh
bun run test-unit-harness                 # build cljs, then run every spec
bun run test-unit-harness-keep-cljs       # the same, with the cljs build that is there
bun run test-unit-harness-keep-cljs ForgotPassword dayjs/parse-zone
bun run test-unit-harness-keep-cljs Navbar -t "collapses"
bun run test-unit-agent-keep-cljs Navbar  # the short output for agents
```

The scripts run `jest --runner ./frontend/test/harness/jest-runner.ts`, so
jest's options work as usual: spec patterns, `-t`, `-u`, `-w`, `--bail`,
`--shard`, `--watch` and the reporters, jest-junit among them.

jest's `--ignoreProjects` takes every argument after it, up to the next option.
So the scripts end with `--runner`, and a spec pattern after the script name
reaches jest as a pattern.

A run with more than 100 spec files for each worker runs them in path order,
which is faster there. A smaller run keeps jest's order: the files that failed
last time first, then the slowest.

`it.only`, `describe.only`, `it.skip`, `it.todo`, `it.failing` and `it.each`
work as they do in jest.

Coverage is not available. The runner stops with an error when it is on. In
watch mode each run starts new workers, so a run after a change loads the
packages again.

## Read the output

`test-unit-harness` prints jest's own output. `test-unit-agent` prints plain
text with fixed prefixes, through `jest-agent-reporter.ts`:

```
FAIL frontend/src/metabase/foo/foo.unit.spec.ts:41 > describe name > test name
  expect(received).toBe(expected) // Object.is equality

  Expected: 2
  Received: 1
  detail: node_modules/.cache/test-harness/last-run/001.txt
SUMMARY files=12 passed=140 failed=1 skipped=3 seconds=9
RERUN bun run test-unit-agent-keep-cljs frontend/src/metabase/foo/foo.unit.spec.ts
```

- `FAIL` gives the file and line of the failure, the test, and a short
  message. The file after `detail:` has the full message, the stack and the
  console output of the test.
- `SUMMARY` gives the counts. `RERUN` is the command that runs the failed
  files again.

The reporter reads jest's results, so it also works with jest's own runner.
There it has no console output for the detail file, because jest prints the
console output as the test runs.

## A failure that comes from an earlier file

A worker keeps packages loaded between spec files. A spec can thus fail
because of something that an earlier file left in a package. jest's own runner
cannot have this failure, because it loads every package again for each file.

Run the failed file again with the `RERUN` command. If it passes alone, an
earlier file changed something that the test depends on, or the test is not
stable. Report it, with the list of spec files that ran before it in the same
worker, if you can. `NT_FILE_LOG` prints that list.

One case is handled: a package that a spec file's `jest.mock` reaches. When a
package loads while a spec file mocks a module, and the package requires that
module, the package keeps the mock. The worker then ends after that file, and
the pool starts a new one.

## A test that leaves async work running

React and Testing Library stay loaded between spec files. An `act()`, a
`waitFor`, a `findBy` query or a user-event call that a test does not wait for
can thus finish in a later test or a later file, and break it there. So a test
fails when such a call is still running after its `afterEach` hooks, or when
one starts after the test ended. The message names the call in the spec. jest
does not have this check.

| Message                                           | What to do                                                                                                  |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| An async waitFor, findBy or user-event call ...   | Add `await` to the call, or to the async function that makes it. Usually that is `setup()`.                 |
| An async act() ...                                | Add `await` to the `act()`.                                                                                 |
| An act() that a waitFor started ...               | Under fake timers, a `waitFor` with an async callback ends before its last `act()`. Make the callback sync. |
| A findBy or waitFor inside a waitFor callback ... | Use a `getBy` query in a synchronous callback. The outer `waitFor` retries it.                              |

## Debug a spec

```sh
NT_NODE_EXTRA=--inspect-brk NT_TIMEOUT=2147483647 NT_HOOK_TIMEOUT=2147483647 \
  bun run test-unit-harness-keep-cljs path/to/the.unit.spec.tsx -w 1
```

The worker prints an address and waits. Open `chrome://inspect`, or attach an
editor to that address, and resume. A `debugger` statement in the spec or in
the code stops there. Waits in Testing Library keep their own limit.

## In CI

The `fe-tests-unit` job in `.github/workflows/frontend.yml` runs the specs
through jest with this runner, in two shards, on each pull request and on each
push to a merge target. jest selects the files, with `--shard` and with
`JEST_TEST_PATHS_FILE`, the list of spec files that the test plan selects for a
pull request. jest writes the JUnit report through jest-junit and the JSON
summary through `--json`. The steps after it read those two files: the result
check, the report to ci-conductor and the quarantine gate.

The `fe-tests-unit-jest` job runs the same specs on jest's own runner on each
push to a merge target, and not on a pull request. A test that passes in one
job and fails in the other is a difference between the two runners.

## How it differs from jest's own runner

|                                                                     | jest's own runner                            | This runner                                 |
| ------------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------- |
| jsdom window                                                        | A new window for each spec file              | A new window for each spec file             |
| Packages from `node_modules`                                        | Evaluated again for each spec file           | Loaded one time for each worker             |
| Project modules                                                     | Evaluated again for each spec file           | Evaluated again for each spec file          |
| Test API                                                            | jest's own globals                           | jest's globals on top of `node:test`        |
| Module resolution and setup files                                   | `jest.config.js`                             | The same values, read from `jest.config.js` |
| Timers, `process.env`, the console, keys added to the global object | Discarded with the sandbox of each spec file | Reset between spec files                    |

The second row is the source of the speed difference. The other rows exist so
that a spec cannot tell which runner it is under.

Coverage reports and the timezone suite are not available here. Use jest's own
runner for those.

## The files

The runner is TypeScript that Node runs directly, without a build step. Its
own files are never transformed or evaluated again between spec files.

| File                                                                 | What it holds                                                                                                |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `jest-runner.ts`                                                     | The jest runner. It runs jest's selected files in the pool, and turns each result into jest's `TestResult`.  |
| `jest-agent-reporter.ts`                                             | A jest reporter with short output for agents, and a detail file for each failure.                            |
| `pool.ts`                                                            | The worker pool. It hands spec files to workers and replaces a worker that uses too much memory.             |
| `jest-config.ts`                                                     | Reads the module mapping, the module roots, the setup files and the projects from `jest.config.js`.          |
| `types.ts`                                                           | The results and messages that pass between a worker, the pool and the runner.                                |
| `worker/main.ts`                                                     | The entry point of a worker. It prepares the environment once, then runs the spec files that the pool sends. |
| `worker/run-file.ts`                                                 | Runs one spec file, and resets the worker for the next one.                                                  |
| `worker/collect.ts`                                                  | jest's `describe`, `it` and hooks, and the rules for `.only`, `.skip` and `-t`.                              |
| `worker/jest-object.ts`                                              | The `jest` object and `expect`, built from jest's own packages.                                              |
| `worker/transform.ts`, `worker/resolve.ts`, `worker/module-hooks.ts` | The swc transform, the module resolution of the jest config, and the Node module hooks that apply both.      |
| `worker/mocks.ts`                                                    | The registry behind `jest.mock`.                                                                             |
| `worker/dom.ts`                                                      | The jsdom window as the global DOM.                                                                          |
| `worker/timers.ts`                                                   | Deadlines, tracked timers and the fake clock.                                                                |
| `worker/async-leaks.ts`                                              | Finds the test that left an `act()` or a `waitFor` running, and fails it.                                    |
| Other files in `worker/`                                             | The resets between spec files, each for one kind of state.                                                   |

`frontend/test/harness-between-files.ts` is next to the jest setup files. It
resets the state that this repository keeps inside packages that stay loaded:
the dayjs locale table and the translation locale.

## When a spec passes under jest and fails here

1. Run the spec alone. If it passes alone, an earlier file left something
   behind. See the section on failures from an earlier file.
2. If it fails alone, look for one of these causes.

| Cause                                                                                                                                        | What to do                                                                                                                    |
| -------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| The spec asserts before the data it needs has loaded. Under jest the file starts slowly, which hides this.                                   | Wait for the data in the spec, with `findBy` or `waitFor`.                                                                    |
| Project code keeps state in a package, such as a locale or a registry.                                                                       | Reset it in `frontend/test/harness-between-files.ts`.                                                                         |
| A package keeps an object from the jsdom window that was current when it loaded. The symptom is an empty `<body>` or events that do nothing. | Add the package to `WINDOW_BOUND_PACKAGES` in `worker/package-loading.ts`. The runner then loads it again for each spec file. |
| Every spec fails with `Cannot find module 'cljs/...'`.                                                                                       | The cljs build is missing. Run `bun run build-pure:cljs`.                                                                     |

## Settings in the environment

jest's options cover normal use. These variables are for a CI job or for work
on the runner.

| Variable           | Default              | Meaning                                                                                     |
| ------------------ | -------------------- | ------------------------------------------------------------------------------------------- |
| `NT_TIMEOUT`       | from the jest config | Time limit of a test, in milliseconds.                                                      |
| `NT_HOOK_TIMEOUT`  | 8000                 | Time limit of a hook, in milliseconds.                                                      |
| `NT_MAX_RSS_MB`    | 1500                 | A worker above this resident size is replaced after its current file.                       |
| `NT_MAX_FILES`     | not set              | A worker is replaced after this many spec files.                                            |
| `NT_HEAP_MB`       | 1536                 | Heap limit of a worker.                                                                     |
| `NT_SEMI_SPACE_MB` | 64                   | Size of the young generation of a worker's heap.                                            |
| `NT_NODE_EXTRA`    | not set              | Extra Node options for each worker, such as `--inspect-brk`.                                |
| `NT_FILE_LOG`      | not set              | Prints a line for each spec file with its worker, time, memory and garbage collection time. |
| `NT_FRAME_MS`      | 1                    | Interval of the animation frame clock, in milliseconds.                                     |
