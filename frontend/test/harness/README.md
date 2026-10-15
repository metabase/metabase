# The node:test runner for the unit specs

This directory holds a second runner for the frontend unit specs. It runs the
jest specs unchanged, on `node:test`, and gives the same results as jest in
about half the time. jest stays the reference. If the two runners disagree
about a spec, jest is right and the difference is a bug here.

## Run it

```sh
bun run test-unit-harness                 # build cljs, then run every spec
bun run test-unit-harness-keep-cljs       # the same, with the cljs build that is there
bun run test-unit-harness-keep-cljs ForgotPassword dayjs/parse-zone
bun run test-unit-harness-keep-cljs Navbar -t "collapses"
bun run test-unit-harness-watch auth/components
```

An argument selects spec files as it does for jest. It is a regular expression
that the runner tests against the path of each spec.

| Option | What it does |
|---|---|
| `-t <regex>` | Runs only the tests whose full name matches. |
| `--watch` | Runs again when a spec, or a file that it loads, changes. |
| `-w <n>` | Sets the number of workers. The default is one for each fast core. |
| `-u` | Writes the snapshots that do not match. |
| `--bail` | Stops after the first spec file that has a failed test. |
| `--debug` | Runs one worker that waits for a debugger, with no time limits. |
| `--no-confirm` | Does not run a failed spec file a second time. |
| `--reporter human\|agent\|json` | Selects the output. |
| `--ignore-projects <a,b>` | Leaves out the specs of these jest projects. |
| `--shard <i>/<n>` | Runs part i of n equal parts of the spec files. |
| `--junit-file <file>` | Writes a JUnit report, with the names that jest-junit gives the tests. |
| `--json-file <file>` | Writes a summary of the results, in the shape of `jest --json`. |

`it.only`, `describe.only`, `it.skip`, `it.todo`, `it.failing` and `it.each`
work as they do in jest.

## Read the output

A test that passes prints nothing. The runner keeps the console output of a
test and shows it only if that test fails.

At a terminal the runner shows a progress line. For each failure it shows the
message from jest's `expect`, the source lines around the failure, and the
console output of the test. A summary follows.

Without a terminal the output is plain text with fixed prefixes:

```
FAIL frontend/src/metabase/foo/foo.unit.spec.ts:41 > describe name > test name
  expect(received).toBe(expected) // Object.is equality

  Expected: 2
  Received: 1
  detail: node_modules/.cache/test-harness/last-run/001.txt
ALONE pass frontend/src/metabase/foo/foo.unit.spec.ts > describe name > other test
SUMMARY files=12 passed=140 failed=2 failed_alone=1 passed_alone=1 skipped=3 seconds=9
RERUN bun run test-unit-harness-keep-cljs frontend/src/metabase/foo/foo.unit.spec.ts
```

- `FAIL` gives the file and line of the failure, the test, and a short
  message. The file after `detail:` has the full message, the stack and the
  console output.
- `ALONE pass` is about the second run of a failed file. See the next section.
- `SUMMARY` gives the counts. `RERUN` is the command that runs the failed
  files again.

The command exits with code 1 if a test fails.

## The second run of a failed file

A worker keeps packages loaded between spec files. A spec can thus fail
because of something that an earlier file left in a package. jest cannot have
this failure, because it loads every package again for each file.

When a spec file has a failed test, the runner runs that file one more time,
alone in a new worker.

- A test that fails again is a real failure.
- A test that passes alone is marked `ALONE pass`. Either an earlier file
  changed something that this test depends on, or the test is not stable.
  Report it, with the list of spec files that ran before it, if you can.

The command exits with code 1 only if a test fails again alone. The runner
skips the second run in watch mode, and when more than 20 spec files have a
failure.

## Watch mode

Watch mode keeps the workers alive, so a second run does not load the packages
again. It records the project files that each spec loaded. When a file changes,
it runs the specs that are that file or that loaded it.

A change to something that a worker loads only once starts the workers again
and repeats the last run. This applies to the cljs build output, to `bun.lock`
and to the jest config.

Keys: `a` runs all selected specs, `f` the ones that failed, Enter the last
set, `q` quits.

## Debug a spec

```sh
bun run test-unit-harness-keep-cljs path/to/the.unit.spec.tsx --debug
```

The worker prints an address and waits. Open `chrome://inspect`, or attach an
editor to that address, and resume. A `debugger` statement in the spec or in
the code stops there. Tests and hooks have no time limit in this mode. Waits in
Testing Library keep their own limit.

## In CI

The `fe-tests-unit` job in `.github/workflows/frontend.yml` runs this runner, in
two shards, on each pull request and on each push to a merge target. The steps
after it were written for jest: the result check, the report to ci-conductor
and the quarantine gate. They read the two files that `--json-file` and
`--junit-file` write. The quarantine list knows a test by its file and its
full name, and the runner writes both as jest-junit does.

The job also reads `JEST_TEST_PATHS_FILE`, the list of spec files that the test
plan selects for a pull request.

The job runs with `--no-confirm`, so a failed spec file does not run a second
time. Each failed test fails the job, as under jest, and ci-conductor sees it.

The `fe-tests-unit-jest` job runs the same specs under jest on each push to a
merge target, and not on a pull request. A test that passes in one job and
fails in the other is a difference between the two runners.

## How it differs from jest

| | jest | This runner |
|---|---|---|
| jsdom window | A new window for each spec file | A new window for each spec file |
| Packages from `node_modules` | Evaluated again for each spec file | Loaded one time for each worker |
| Project modules | Evaluated again for each spec file | Evaluated again for each spec file |
| Test API | jest's own globals | jest's globals on top of `node:test` |
| Module resolution and setup files | `jest.config.js` | The same values, read from `jest.config.js` |
| Timers, `process.env`, the console, keys added to the global object | Discarded with the sandbox of each spec file | Reset between spec files |

The second row is the source of the speed difference. The other rows exist so
that a spec cannot tell which runner it is under.

Coverage reports and the timezone suite are not available here. Use jest for
those.

## The files

The runner is TypeScript that Node runs directly, without a build step. Its
own files are never transformed or evaluated again between spec files.

| File | What it holds |
|---|---|
| `cli.ts` | The command line and watch mode. |
| `pool.ts` | The worker pool. It hands spec files to workers and replaces a worker that uses too much memory. |
| `reporters.ts` | The three kinds of output. |
| `ci-results.ts` | The JUnit report and the JSON summary that the CI job reads. |
| `jest-config.ts` | Reads the module mapping, the module roots, the setup files and the projects from `jest.config.js`. |
| `types.ts` | The results and messages that pass between a worker, the pool and the reporters. |
| `durations.json` | The time that each spec file took, used for the estimate in the progress line on a machine with no times of its own. |
| `worker/main.ts` | The entry point of a worker. It prepares the environment once, then runs the spec files that the pool sends. |
| `worker/run-file.ts` | Runs one spec file, and resets the worker for the next one. |
| `worker/collect.ts` | jest's `describe`, `it` and hooks, and the rules for `.only`, `.skip` and `-t`. |
| `worker/jest-object.ts` | The `jest` object and `expect`, built from jest's own packages. |
| `worker/transform.ts`, `worker/resolve.ts`, `worker/module-hooks.ts` | The swc transform, the module resolution of the jest config, and the Node module hooks that apply both. |
| `worker/mocks.ts` | The registry behind `jest.mock`. |
| `worker/dom.ts` | The jsdom window as the global DOM. |
| `worker/timers.ts` | Deadlines, tracked timers and the fake clock. |
| Other files in `worker/` | The resets between spec files, each for one kind of state. |

`frontend/test/harness-between-files.ts` is next to the jest setup files. It
resets the state that this repository keeps inside packages that stay loaded:
the dayjs locale table and the translation locale.

## When a spec passes under jest and fails here

1. Run the spec alone. If it passes alone, an earlier file left something
   behind. See the section on the second run.
2. If it fails alone, look for one of these causes.

| Cause | What to do |
|---|---|
| The spec asserts before the data it needs has loaded. Under jest the file starts slowly, which hides this. | Wait for the data in the spec, with `findBy` or `waitFor`. |
| Project code keeps state in a package, such as a locale or a registry. | Reset it in `frontend/test/harness-between-files.ts`. |
| A package keeps an object from the jsdom window that was current when it loaded. The symptom is an empty `<body>` or events that do nothing. | Add the package to `WINDOW_BOUND_PACKAGES` in `worker/package-loading.ts`. The runner then loads it again for each spec file. |
| Every spec fails with `Cannot find module 'cljs/...'`. | The cljs build is missing. Run `bun run build-pure:cljs`. |

## Settings in the environment

The command line covers normal use. These variables are for a CI job or for
work on the runner.

| Variable | Default | Meaning |
|---|---|---|
| `NT_TIMEOUT` | from the jest config | Time limit of a test, in milliseconds. |
| `NT_HOOK_TIMEOUT` | 8000 | Time limit of a hook, in milliseconds. |
| `NT_MAX_RSS_MB` | 1500 | A worker above this resident size is replaced after its current file. |
| `NT_HEAP_MB` | 1536 | Heap limit of a worker. |
| `NT_SEMI_SPACE_MB` | 64 | Size of the young generation of a worker's heap. |
| `NT_FILE_LOG` | not set | Prints a line for each spec file with its worker, time, memory and garbage collection time. |
| `NT_FRAME_MS` | 1 | Interval of the animation frame clock, in milliseconds. |
