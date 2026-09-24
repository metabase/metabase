# E2E journey capture

`.github/workflows/e2e-journey-capture.yml` runs the Cypress suite against an instrumented build and keeps raw, per-test data:

- frontend function counters (Istanbul), optionally including the browser copy of the cljs code
- one ordered event stream per test: navigations, requests with who made them, Cypress commands and assertions
- backend coverage per test, as the set of backend classes that ran (JaCoCo)
- optionally, step snapshots: the frontend and backend code each test ran between two steps (navigations, assertions or commands)

Nothing is subtracted or filtered on the runner. Setup traffic (`cy.request`, `/api/testing/*`) stays in, tagged. Baselines are captured in the same format in every shard, so a reader can subtract them later. `e2e/coverage/journey-capture.mjs` is a reader that does this.

The workflow is separate from the nightly coverage manifest (`e2e-coverage-manifest.yml`) and shares none of its artifacts. The shared support files only record the extra data when `JOURNEY_CAPTURE=true`, and the nightly's payload is unchanged.

Every shard artifact also carries a copy of this file.

## Running it

```
gh workflow run e2e-journey-capture.yml --ref <branch> -f shards=2 -f spec=e2e/test/scenarios/question/saved.cy.spec.js
```

GitHub only dispatches a workflow that is on the default branch, or one that has already run at least once. Before this file is on `master`, a temporary `push` trigger limited to the branch gives it that first run.

Inputs:

| Input                    | Default                  | Meaning                                                                                                                    |
| ------------------------ | ------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `spec`                   | empty                    | comma-separated spec paths or globs, relative to the repo, passed to cypress-split as `SPEC`. Empty runs every spec        |
| `shards`                 | 100                      | number of shards                                                                                                           |
| `edition`                | ee                       | edition to build                                                                                                           |
| `grep_tags`              | `-@mongo+-@python+-@OSS` | Cypress grep tags, same as the nightly                                                                                     |
| `idle_seconds`           | 5                        | length of each backend idle window. The median test takes about 3.4 s without instrumentation                              |
| `backend_coverage`       | true                     | attach the JaCoCo agent                                                                                                    |
| `cljs_coverage`          | true                     | build with `INSTRUMENT_CLJS_COVERAGE=true`                                                                                 |
| `step_snapshots`         | assertions               | `none`, `navigations`, `assertions` (navigations too) or `commands` (everything)                                           |
| `compare_step_snapshots` | false                    | run the shard's tests a second time with `step_snapshots: none`, into `tests-control/`, to measure what the snapshots cost |
| `keep_test_exec`         | false                    | also keep a raw `.exec` per test and per step. Large, meant for small runs                                                 |

Dispatched runs keep their artifacts for 30 days.
A run without dispatch inputs (a `push` trigger) uses a 2-shard smoke configuration:
`e2e/test/scenarios/question/saved.cy.spec.js` and `e2e/test/scenarios/custom-column/cc-typing-suggestion.cy.spec.js`,
`assertions` snapshots with the control pass, a raw `.exec` per test, and 7-day retention.

## Artifacts

- `journey-capture-uberjar`: the instrumented build, kept for 1 day.
- `journey-capture-openapi`: the `openapi.json` generated at the run's SHA, for matching captured routes to endpoints.
- `journey-capture-cljs`: `target/cljs_release/metabase*.js` and their source maps, when `cljs_coverage` is on. See "cljs functions" below.
- `journey-capture-shard-<n>`: one per shard, laid out as below.

```
meta.json                      run and shard metadata (see below)
README.md                      this file
fnmap-<uuid>.json              Istanbul function metadata per file: {file: {fnIndex: {name, line, column}}}
summary.txt                    the reader's summary: counts, recording errors, step consistency check, timing against the control pass
tests/<spec>.json              one file per spec, kind "test"
tests-control/<spec>.json      the same tests without step snapshots, when compare_step_snapshots is on
snapshots/<spec>.json          the snapshot creators, kind "snapshot"
baselines/start/<spec>.json    Cypress baselines before the shard's tests, kind "baseline"
baselines/end/<spec>.json      the same baselines after the shard's tests
baselines/backend/<name>.json  backend-only baselines taken outside Cypress, kind "baseline"
backend/classes.jsonl          class dictionary for every backend index in this shard
backend/exec/...               raw JaCoCo .exec files: every baseline, plus tests and steps with keep_test_exec
```

`<spec>` is the spec path relative to the repo, with `/` replaced by `__`. Paths inside Istanbul data are absolute on the runner (`/home/runner/work/metabase/metabase/...`). Strip that prefix before relativizing. Several `fnmap-*.json` files are normal: each Cypress process writes its own, and entries for the same file are identical.

### meta.json

```
{
  "schema": "metabase-e2e-journey-capture",
  "schemaVersion": 1,
  "sha", "ref", "event", "runId", "runAttempt",
  "shard": {"index", "count"},
  "inputs": the raw dispatch inputs ({} or null for other triggers),
  "effective": {"spec", "edition", "grepTags", "idleSeconds"},
  "capture": {"frontendFunctions", "cljsFunctions", "events", "stepSnapshots", "controlPassWithoutSteps",
              "backend": {"agent": "jacoco", "version", "includes", "granularity": "class", "keepTestExec"} or null},
  "java", "startedAt", "finishedAt",
  "outcomes": {"baselinesStart", "tests", "testsControl", "baselinesEnd"}   GitHub step outcomes. Tests may fail, the data is kept
  "sizeBeforeMetadata": {"rawBytes", "gzipBytes"}
}
```

Readers should check `schema` and `schemaVersion` and refuse versions they don't know.

### Spec files (`tests/`, `snapshots/`, `baselines/start|end/`)

```
{
  "kind": "test" | "snapshot" | "baseline",
  "baseline": {"name", "round": "start" | "end"}   baselines only
  "variant": "control"                            tests-control only
  "stepSnapshots": "none" | "navigations" | "assertions" | "commands"
  "spec": "e2e/test/scenarios/...",
  "coverage": {absoluteFile: {"f": {fnIndex: count}}}   spec-level counters from @cypress/code-coverage, files with a fired function only
  "tests": [test attempt, ...]
}
```

The baseline name is the spec file name up to `.cy.`:

- `coverage-baseline`: `e2e/test/scenarios/coverage-baseline.cy.spec.js`, the same spec the nightly subtracts. It restores, signs in as admin and loads `/`.
- `coverage-baseline-premium-token`: the same with `H.activateToken("bleeding-edge")`, from `e2e/journey-capture/baselines/`. Its app-shell code fires on every page of tests that activate a token.

Each test attempt:

```
{
  "title": Mocha fullTitle(),
  "attempt": 0-based retry index,
  "attemptId": id shared with the attempt's step .exec files,
  "state": "passed" | "failed" | ...,
  "f": {absoluteFile: {fnIndex: count}}   functions fired during this attempt, counters zeroed after each attempt
  "routes": ["METHOD /path", ...]   deduped and sorted, same as the nightly. Third-party hosts keep their origin
  "pages": ["/path", ...]           document loads only, deduped and sorted
  "events": [event, ...]            in order
  "durationMs": browser-measured time from test:before:run to the start of the capture's afterEach
  "capture": {...}                  what the recording itself cost, see below
  "steps": see below, only when step snapshots are on
  "backend": {"beforeTest": dump, "test": dump} or undefined
}
```

`f`, `routes` and `pages` have the same meaning as in the nightly coverage manifest's raw files, so existing readers work on them. Unlike the nightly, `routes` includes `cy.request` traffic.

`capture` has:

- `snapshotMs` and `snapshots`: time spent taking step snapshots in the browser, and how many were taken
- `eventMs`: time spent in the other recording handlers in the browser
- `drainMs`: how long the afterEach task waited for the attempt's backend step dumps
- `dumpRequests` and `stepDumpsReceived`: backend step dumps the browser asked for, and how many reached the listener
- `errors`: recording failures. Recording never fails a test, it counts here instead
- `droppedEvents`, `droppedCuts`: events past 5,000 and cuts past 2,000 per attempt, which aren't kept
- `lateCuts`: cuts that arrived after the final cut and were discarded
- `lateStepDumpRequests`: step dump requests from earlier attempts that arrived after those attempts were written. They skip the dump, so their code lands in the next dump
- `requestOverwrites`: how often the `Cypress.Commands.overwrite("request")` wrapper ran. See "Known gaps"

#### Events

Every event has `seq` (order within the attempt), `t` (ms since the attempt started), `kind`, `phase` (`"test"`, the Mocha hook name such as `"before each"`, or null between runnables) and `url` (the app's pathname at that moment).

| kind      | fields                                   | source                                                                                                                                                                                               |
| --------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `nav`     | `how`: `"document"` or `"url"`, `path`   | `window:before:load` for top-window document loads, and `url:changed`, which also fires for pushState and hash changes                                                                               |
| `request` | `initiator`, `method`, `path`, `helpers` | `initiator` is `fetch` or `xhr` (wrappers in the app window), `proxy:<resourceType>` (the pass-through `cy.intercept`, which also sees iframes), `cy.request` (`command:start`) or `journey-capture` |
| `command` | `name`, `chain`, `helpers`               | Cypress `command:start`. `cy.task` and the capture's own `cy.intercept` are left out                                                                                                                 |
| `assert`  | `state`, `message`, `chain`, `helpers`   | Cypress `log:added`/`log:changed` with name `assert`, once per assertion when it ends. A retried `.should()` records one event, with its final state                                                 |

- One browser request can show up both as `fetch`/`xhr` and as `proxy:*`. That is the same request seen twice.
- Framed documents (embedding) show up as `proxy:document` requests, not `nav` events.
- `path` of a request has the same form as `routes`: a bare path for the app's own origin, origin and path for third-party hosts.
- `journey-capture` requests are the step snapshots' own backend dump requests. They never appear in `routes`.
- `chain` is the command chain the event belongs to, for example `get("[data-testid=x]").should("be.visible")`. Arguments are clipped at 300 characters.
- `helpers` lists the functions from the spec and support bundles on the JS stack when the command was queued, outermost first (for example `["Context.eval", "visitQuestion"]`, where `Context.eval` is the test or hook body). It comes from Cypress's `userInvocationStack` and names only functions that appear in stack frames.
- Commands from `@cypress/code-coverage`'s own hooks appear with phase `"after each"`.
- Cypress sends `log:changed` at most every 4 ms, so a `.should()` assert event lands a few milliseconds after the assertion passed, sometimes after the next command's `command:start`. `url:changed` also arrives shortly after the navigation.

#### Backend dumps

```
{
  "window": {"start", "end"}   epoch ms, from the agent: start is the previous reset, end is this dump
  "classes": [index, ...]      sorted indices into backend/classes.jsonl, classes with at least one probe hit
  "exec": "backend/exec/..."   when the raw dump was kept
  "error": "..."               instead of the above when the dump failed
}
```

- `beforeTest` is dumped by the root `beforeEach`. It holds what ran since the previous dump: suite-level `before()` hooks, the previous test's leftovers and background jobs.
- `test` is dumped after the attempt's last `afterEach` and holds the test's hooks and body.

`backend/classes.jsonl` has one JSON line per class, `["metabase/api/card$fn__12345", "<crc64 class id, hex>"]`, with the JVM's internal class name (slashes, not dots). The line number (0-based) is the index. Every process of the shard appends to the same file, so indices are only valid within one shard artifact. Only classes matching `metabase.*` and `metabase_enterprise.*` are instrumented.

Granularity: every `defn`, `fn` and `defmethod` body compiles to its own class, so the class set is the function-level set for those. Protocol methods of one `defrecord`, `deftype` or `reify` share a class. Loading a namespace runs its `<ns>__init` class and constructs every function class it defines, which counts as a hit. So when a dump has `<ns>__init`, that namespace's other classes in the same dump may only have been constructed, not called.

The per-test data is converted to class sets on the runner, because a raw `.exec` per test for the whole suite is several GB. That drops probe-level (line-level) detail. The baselines keep their raw `.exec` files, and `keep_test_exec` keeps them for tests and steps too. `.exec` files are standard JaCoCo execution data (format version 0x1007), readable by `jacococli` or `e2e/coverage/jacoco.js`. Mapping them to lines needs the class files from `journey-capture-uberjar`.

### Step snapshots (`steps`)

```
{
  "mode": "navigations" | "assertions" | "commands",
  "files": [absoluteFile, ...],   file table for this attempt
  "cuts": [
    {
      "seq": the event-stream position: events with a smaller seq happened before the cut,
      "trigger": "document" | "nav" | "assert" | "command" | "end",
      "triggerSeq": seq of the event that caused the cut, or null,
      "t", "phase", "url",
      "inFlight": app fetch/XHR requests started and not finished at the cut,
      "f": [fileIndex, fnIndex, count, ...]   flat triples, functions that ran since the previous cut
      "backend": dump, plus {"step", "seq", "sentAt", "receivedAt", "startedAt", "latencyMs"} for step dumps
    }
  ]
}
```

Each cut holds what ran since the previous cut. The last cut, `end`, is taken in the same synchronous turn as the per-test flush, so it holds the rest of the attempt.

- Cuts happen inside Cypress event handlers (`window:before:load`, `url:changed`, `log:added`/`log:changed`, `command:end`). They never queue a Cypress command, so the command queue, retries and timing stay as they are. Everything is buffered in the browser and sent once, by the afterEach flush.
- `document` cuts come before the new page loads, `nav` cuts after every URL change, `assert` cuts when an assertion ends, `command` cuts when a command ends.
- The frontend cut reads the function counters (`f`) of every tracked app window and compares them with the values at the previous cut. It doesn't zero them, so the per-test `f` is still read straight from the counters at the flush, which keeps the consistency check meaningful. The files each window has registered are kept in a list and only rescanned when the window registers new ones.
- A cut doesn't wait for the network. `inFlight` says how many app requests were still running, so a cut with requests in flight has a fuzzy boundary: their responses land in a later step. A `fetch` counts until its response headers arrive, an XHR until `loadend`.
- The backend can't be dumped synchronously from the browser. Each cut sends a fire-and-forget `POST` to a listener the Cypress config process runs on `127.0.0.1:6301` (path `/__journey-capture/backend-dump`), which dumps and resets the JaCoCo agent over its TCP port. Dumps run one at a time in the order they arrive. `latencyMs` is the time from the cut in the browser to the dump in the backend: code that runs in that interval lands in this step rather than the next. The request goes through Cypress's proxy like any browser request.
- The final cut's backend is the per-test dump taken by the afterEach task, which first waits up to 10 s for the attempt's step dumps (`drainMs`).
- With step snapshots on, `backend.test` is the union of the cuts' dumps and has `"fromSteps": true`. Every dump resets the agent, so no independent per-test backend total exists.

#### Consistency check

`checkSteps()` in the reader, printed per shard in `summary.txt`, with the first 20 failing attempts listed:

- frontend: summing the cuts' deltas per function gives exactly the per-test `f`, which is read separately at the flush. Any difference means a cut missed code, for example a window or a lazily loaded file.
- backend: the attempt's dump windows (`beforeTest` and every cut) follow each other, and the cuts' dumps ran in cut order. The agent timestamps each reset right after writing the dump, so a gap between one window's end and the next one's start is time whose hits no dump holds. Writing a dump takes a few milliseconds, so small gaps are expected. The check reports them, and lists attempts whose gaps add up to more than 50 ms.

#### Measuring the cost

With `compare_step_snapshots`, each shard runs its tests twice on the same runner and backend: first with step snapshots, then without, into `tests-control/`. The reader matches tests by spec, title and attempt and compares wall time (`durationMs` + `drainMs`), and prints the browser time spent in snapshots and event handlers. The control pass runs second, on a warmed-up backend, so the reported slowdown is an upper bound. The JaCoCo agent and the event stream are on in both passes. To measure those as well, compare with a dispatch that has `backend_coverage: false` and `step_snapshots: none`, using `--compare`.

### Backend-only baselines (`baselines/backend/`)

Taken by `node e2e/coverage/journey-capture-backend.js <name> [start|end]`, outside Cypress, in this order per shard:

1. `backend-boot`: JVM start until just before the snapshot creators run
2. snapshot creators (`snapshots/`)
3. `backend-unattributed-start`: whatever ran since the last dump. This entry resets the counters for the idle window
4. `backend-idle-start`: `idle_seconds` with no browser, measuring background jobs
5. Cypress baselines, round `start`
6. the shard's tests, then the control pass when it is on
7. Cypress baselines, round `end`
8. `backend-unattributed-end`, then `backend-idle-end`

Each file is `{"kind": "baseline", "baseline": {"name", "position"}, "backend": dump}`.

### cljs functions

With `cljs_coverage`, the build also instruments `target/cljs_release/metabase.*.js`, the advanced-compiled browser copy of the cljs code (`metabase.lib` and friends). Their `f` counters use those files as keys, like any other file. The code is minified, so `fnmap` names are `(anonymous_N)` and most functions sit on the same line. Journey-capture `fnmap` entries therefore also have `column`. To map a function to cljs source, look up its `line` and `column` in the matching `.js.map` from the `journey-capture-cljs` artifact.

## Size

Estimates, not measurements. They start from the nightly coverage artifacts (about 51 tests per shard at 100 shards, 95 KB of `f`, `routes` and `pages` per test, compressing 7x) and assume 150 to 500 events and 10 to 60 assertion cuts per test. The backend part assumes about 48,000 `metabase` classes at 75 to 95 bytes each in a `.exec`, nearly all of them hit during boot. `meta.json` (`sizeBeforeMetadata`) and each shard's step summary give real numbers.

| Setting                      | Per test, raw | Per shard, zipped | Whole run (100 shards), zipped |
| ---------------------------- | ------------- | ----------------- | ------------------------------ |
| `step_snapshots: none`       | 150-300 KB    | 5-9 MB            | 0.5-0.9 GB                     |
| `step_snapshots: assertions` | 300-650 KB    | 6-12 MB           | 0.6-1.2 GB                     |
| `step_snapshots: commands`   | 0.45-1 MB     | 8-14 MB           | 0.8-1.4 GB                     |

About 4 to 6 MB of each zipped shard is fixed: the baseline `.exec` files (the boot dump alone is about 4 MB raw), `backend/classes.jsonl` and `fnmap`. Unzipped is roughly four to six times larger. `compare_step_snapshots` adds the `none` size of the tests again. `keep_test_exec` adds 0.5 to 2 MB per test, so it is only meant for a few specs. The run-level `journey-capture-cljs` artifact is about 10 MB zipped.

## Reading a run

```
gh run download <run id> -p 'journey-capture-shard-*' -D <run dir>
node e2e/coverage/journey-capture.mjs <run dir> [--subtract] [--baselines <name,...>] [--compare <other run dir>]
```

It prints, per shard: counts, recording errors, the step consistency check, the timing comparison against `tests-control/` and against `--compare`, and the backend baselines. `<run dir>` can also be a single shard directory.

As a library it exports `shardDirs()`, `loadShard()`, `iterateRun()` (one shard at a time), `subtractBaselines()`, `checkSteps()` and `compareTiming()`. Subtraction is per shard, because every shard has its own backend:

- frontend functions: drop functions the chosen baselines fired (default `coverage-baseline`, both rounds)
- routes: drop routes the chosen baselines requested
- backend classes: drop classes seen in the chosen Cypress baselines and in `backend-idle` (both positions)

`--baselines coverage-baseline-premium-token` subtracts the premium-token baseline instead.

## Known gaps

- Frontend counters are read from the top app window only. Code running in iframes (the embedding SDK, data apps) has no function counts. Its requests still appear in `events` and `routes`.
- Background jobs in the backend land in whichever test is running. The idle windows measure how much that is.
- The nightly `routes` have no `cy.request` traffic. In CI, `cypress-terminal-report` also overwrites `request`, and Cypress's `Commands.overwrite` wraps the original command rather than the previous overwrite, so the last overwrite wins. Journey capture records `cy.request` from `command:start` instead, and `capture.requestOverwrites` shows whether the overwrite ran.
