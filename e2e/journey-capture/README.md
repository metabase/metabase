# E2E journey capture

`.github/workflows/e2e-journey-capture.yml` runs the Cypress suite against an instrumented build and keeps raw, per-test data:

- frontend function and branch counters (Istanbul), optionally including the browser copy of the cljs code
- one ordered event stream per test: navigations, requests with who made them and what they sent, Cypress commands and assertions
- backend coverage per test, as the set of backend classes that ran (JaCoCo)
- optionally, step snapshots: the frontend and backend code each test ran between two steps (navigations, assertions or commands)

Nothing is subtracted or filtered on the runner. Setup traffic (`cy.request`, `/api/testing/*`) stays in, tagged. Baselines are captured in the same format in every shard, so a reader can subtract them later. `e2e/coverage/journey-capture.mjs` is a reader that does this.

The workflow is separate from the nightly coverage manifest (`e2e-coverage-manifest.yml`) and shares none of its artifacts. The shared support files only record the extra data when `JOURNEY_CAPTURE=true`, and the nightly's payload is unchanged.

Before a shard's data leaves the runner, it is scrubbed of secrets and encrypted, as described in [Secrets](#secrets). It also carries a copy of this file.

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
| `upload`                 | true                     | upload the encrypted shard data, `journey-capture-cljs` and `journey-capture-openapi`. Off uploads none of them, see below |
| `encryption_check`       | false                    | run no tests, only the scrub, encryption and upload of a dummy capture. See [Encryption check](#encryption-check)          |

Every artifact is kept for 7 days, except the encryption check's, which is kept for 1 day.

With `upload: false`, each shard still runs every step up to and including the encryption, then prints `Validation run, nothing uploaded: pass` or `FAIL`, with the scrub's counts, to its log and step summary.
The instrumented uberjar is the one artifact such a run uploads, because the shards download it. It holds no capture data.

A run without dispatch inputs (a `push` trigger) uses a 2-shard smoke configuration:
`e2e/test/scenarios/question/saved.cy.spec.js` and `e2e/test/scenarios/custom-column/cc-typing-suggestion.cy.spec.js`,
`assertions` snapshots with the control pass and a raw `.exec` per test.
It uploads nothing, as with `upload: false`.

## Artifacts

- `journey-capture-uberjar`: the instrumented build.
- `journey-capture-openapi`: the `openapi.json` generated at the run's SHA, for matching captured routes to endpoints.
- `journey-capture-cljs`: `target/cljs_release/metabase*.js` and their source maps, when `cljs_coverage` is on. See "cljs functions" below.
- `journey-capture-shard-<n>`: one per shard, holding a single file, `journey-capture-shard-<n>.tar.gz.age`. It is the shard's data, laid out as below, as a gzipped tarball encrypted with age. [Secrets](#secrets) says how to read it.

The first three are built from the run's commit and hold no capture data, so they aren't encrypted.

```
meta.json                      run and shard metadata (see below)
README.md                      this file
fnmap-<uuid>.json              Istanbul function metadata per file: {file: {fnIndex: {name, line, column}}}
branchmap-<uuid>.json          Istanbul branch metadata per file: {file: [[type, line, column, arms], ...]}, indexed by branch index
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

`<spec>` is the spec path relative to the repo, with `/` replaced by `__`. Paths inside Istanbul data are absolute on the runner (`/home/runner/work/metabase/metabase/...`). Strip that prefix before relativizing. Several `fnmap-*.json` and `branchmap-*.json` files are normal: each Cypress process writes its own pair, and entries for the same file are identical.

In a `branchmap` entry, `type` is Istanbul's branch type (`if`, `cond-expr`, `binary-expr`, `switch`, `default-arg`, ...), `line` and `column` are where the branch starts, and `arms` is its number of arms. Arm `i` of an `if` or `cond-expr` is the `i`-th outcome (consequent, then alternate), of a `binary-expr` the `i`-th operand, of a `switch` the `i`-th case.

### meta.json

```
{
  "schema": "metabase-e2e-journey-capture",
  "schemaVersion": 3,
  "sha", "ref", "event", "runId", "runAttempt",
  "shard": {"index", "count"},
  "inputs": the raw dispatch inputs ({} or null for other triggers),
  "effective": {"spec", "edition", "grepTags", "idleSeconds"},
  "capture": {"frontendFunctions", "frontendBranches", "cljsFunctions", "events", "stepSnapshots", "controlPassWithoutSteps",
              "backend": {"agent": "jacoco", "version", "includes", "granularity": "class", "keepTestExec"} or null},
  "java", "startedAt", "finishedAt",
  "outcomes": {"baselinesStart", "tests", "testsControl", "baselinesEnd"}   GitHub step outcomes. Tests may fail, the data is kept
  "sizeBeforeMetadata": {"rawBytes", "gzipBytes"}
}
```

Readers should check `schema` and `schemaVersion` and refuse versions they don't know.

Schema 2 adds, and schema 1 artifacts lack:

- per-test branch hits (`branchHits`, `branchFiles`) and `branchmap-*.json`
- request bodies on `request` events (`body`, `bodyHash`, `bodyBytes`, `bodyType`)
- `chainerId` on `command`, `cy.request` and `assert` events, and the assertion's own chain, `callSite` and `chainSource`
- step dumps limited to one per 250 ms, with `dumpSkipped` and `dumpFailed` on cuts and `skippedDumps`, `failedDumpRequests` and `drainStop` in `capture`

In schema 1, an assert event's `chain` and `helpers` describe whatever command was running when the assertion ended, which is rarely the assertion's own chain.

Schema 3 adds, and schema 1 and 2 artifacts lack:

- the counters of same-origin child frames in `f`, `branchHits` and the cuts' `f`

### Spec files (`tests/`, `snapshots/`, `baselines/start|end/`)

```
{
  "kind": "test" | "snapshot" | "baseline",
  "baseline": {"name", "round": "start" | "end"}   baselines only
  "variant": "control"                            tests-control only
  "stepSnapshots": "none" | "navigations" | "assertions" | "commands"
  "spec": "e2e/test/scenarios/...",
  "coverage": {absoluteFile: {"f": {fnIndex: count}}}   spec-level counters from @cypress/code-coverage, files with a fired function only
  "branchFiles": [absoluteFile, ...]                  file table for the tests' branchHits, when any test has one
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
  "branchHits": [fileIndex, branchIndex, armIndex, count, ...]   branch arms that ran during this attempt, flat quads, fileIndex into the spec's branchFiles
  "routes": ["METHOD /path", ...]   deduped and sorted, same as the nightly. Third-party hosts keep their origin
  "pages": ["/path", ...]           document loads only, deduped and sorted
  "events": [event, ...]            in order
  "durationMs": browser-measured time from test:before:run to the start of the capture's afterEach
  "capture": {...}                  what the recording itself cost, see below
  "steps": see below, only when step snapshots are on
  "backend": {"beforeTest": dump, "test": dump} or undefined
}
```

`f`, `routes` and `pages` have the same meaning as in the nightly coverage manifest's raw files, so existing readers work on them. Unlike the nightly, `routes` includes `cy.request` traffic, and `f` includes frames.

`f`, `branchHits` and the cuts' `f` hold the counters of the app window and of its same-origin child frames, nested ones included, where the embedding SDK and static embeds run the app. A frame runs the same files as the window around it, so its counts add to the window's under the same file and function. The capture reads a frame's counters at every cut, at the flush and when the frame loads, so a frame that goes away before the next cut still counts. Frames on another origin are left out, even though the capture's Chrome, which runs without web security, can read them.

`branchHits` only lists arms with a count above zero. Like `f`, it is read at the per-test flush, before the counters are zeroed, and step cuts don't have it.

`capture` has:

- `snapshotMs` and `snapshots`: time spent taking step snapshots in the browser, and how many were taken
- `eventMs`: time spent in the other recording handlers in the browser
- `drainMs`: how long the afterEach task waited for the attempt's backend step dumps
- `drainStop`: why that wait ended. `received` when every request arrived, `stalled` when none arrived and no dump finished for 10 s, `capped` after 40 s
- `dumpRequests` and `stepDumpsReceived`: backend step dumps the browser asked for, and how many reached the listener
- `skippedDumps`: cuts that asked for no dump, because the previous request was less than 250 ms earlier
- `failedDumpRequests`: dump requests the browser saw fail before the flush. They are also counted in `errors`
- `errors`: recording failures. Recording never fails a test, it counts here instead
- `droppedEvents`, `droppedCuts`: events past 5,000 and cuts past 2,000 per attempt, which aren't kept
- `lateCuts`: cuts that arrived after the final cut and were discarded
- `lateStepDumpRequests`: step dump requests from earlier attempts that arrived after those attempts were written. They skip the dump, so their code lands in the next dump
- `requestOverwrites`: how often the `Cypress.Commands.overwrite("request")` wrapper ran. See "Known gaps"

#### Events

Every event has `seq` (order within the attempt), `t` (ms since the attempt started), `kind`, `phase` (`"test"`, the Mocha hook name such as `"before each"`, or null between runnables) and `url` (the app's pathname at that moment).

| kind      | fields                                                                                             | source                                                                                                                                                                                               |
| --------- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `nav`     | `how`: `"document"` or `"url"`, `path`                                                             | `window:before:load` for top-window document loads, and `url:changed`, which also fires for pushState and hash changes                                                                               |
| `request` | `initiator`, `method`, `path`, `helpers`, `chainerId`, `body`, `bodyHash`, `bodyBytes`, `bodyType` | `initiator` is `fetch` or `xhr` (wrappers in the app window), `proxy:<resourceType>` (the pass-through `cy.intercept`, which also sees iframes), `cy.request` (`command:start`) or `journey-capture` |
| `command` | `name`, `chainerId`, `chain`, `helpers`                                                            | Cypress `command:start`. `cy.task` and the capture's own `cy.intercept` are left out                                                                                                                 |
| `assert`  | `state`, `message`, `chainerId`, `chain`, `helpers`, `callSite`, `chainSource`                     | Cypress `log:added`/`log:changed` with name `assert`, once per assertion when it ends. A retried `.should()` records one event, with its final state                                                 |

- One browser request can show up both as `fetch`/`xhr` and as `proxy:*`. That is the same request seen twice.
- Framed documents (embedding) show up as `proxy:document` requests, not `nav` events.
- `path` of a request has the same form as `routes`: a bare path for the app's own origin, origin and path for third-party hosts.
- No recorded URL keeps its query string or hash: `routes`, `pages`, `nav` and request paths, and every event's `url`, are paths only. The arguments of commands other than `cy.request`, such as a `cy.visit` URL, are recorded as the test wrote them.
- `journey-capture` requests are the step snapshots' own backend dump requests. They never appear in `routes`.
- `cy.request` events record the request body as `body`: canonical JSON with object keys sorted, clipped at 2,048 characters. `bodyHash` (FNV-1a 64 of the UTF-8 bytes, 16 hex digits) and `bodyBytes` cover the whole canonical text, so two setups with the same fixture have the same hash. The value of every key matching `password`, `token`, `secret` or `session` (any case, at any depth) is `"<masked>"`, before hashing. A string body that holds JSON is canonicalized as that JSON, other strings have matching form fields masked. A body that isn't plain JSON (`FormData`, `Blob`, `ArrayBuffer`, ...) records only `bodyType`. Body-less requests have none of these fields. A `cy.request` with `{log: false}` records `"bodyType": "hidden"` and no other body field.
- `proxy:*` events record `bodyHash` and `bodyBytes` of the body the pass-through `cy.intercept` sees, never the body itself. Cypress parses JSON bodies for intercept handlers and forwards `JSON.stringify` of them, so the hash is of the bytes the backend receives. Multipart bodies, whose random boundary changes the hash on every request, record `"bodyType": "multipart"` and `bodyBytes` only. Binary bodies, which Cypress hands the handler as a buffer, record only `bodyType`. `fetch` and `xhr` events have no body fields: the app sends most requests as `fetch(new Request(...))`, whose body is a stream that can't be read without consuming it.
- Before a spec file is written, every value of a runner environment variable whose name contains `TOKEN`, `SECRET`, `PASSWORD`, `API_KEY` or `PRIVATE` and that is at least 16 characters long is replaced with `<masked>`, wherever it appears. That covers the premium tokens, which tests send to `/api/setting/premium-embedding-token` as `{"value": ...}` and type into the licence form. The scrub before upload also covers the pieces of them that clipping leaves, see [Secrets](#secrets).
- `chain` is the command chain the event belongs to, for example `get("[data-testid=x]").should("be.visible")`. Arguments are clipped at 300 characters, and a chain at 8 commands. A `command` event's chain ends at that command.
- In a chain, a `cy.request` is `request(<METHOD> <path>)`, with the path in the same form as a request event's `path`, and never its body, headers or query string. A command with `{log: false}` in its arguments shows each of them as `<hidden>`, for example `type(<hidden>, <hidden>)`. Tests use `{log: false}` to keep secrets out of the Cypress log.
- `helpers` lists the functions from the spec and support bundles on the JS stack when the command was queued, outermost first (for example `["Context.eval", "visitQuestion"]`, where `Context.eval` is the test or hook body). It comes from Cypress's `userInvocationStack` and names only functions that appear in stack frames.
- `chainerId` is Cypress's id for one `cy.a().b().should()` chain, shared by all its commands. Cypress gives an assertion's log the `chainerId` of the command running when the log is created, which for `.should()` is a command of its own chain and for `expect()` inside `.then()` is that `then`. Matching `chainerId` joins an assertion to its `command` and `cy.request` events (`assertionChains()` in the reader). A `.should()` that Cypress runs as part of the command before it never starts on its own, so it has no `command` event.
- An `assert` event's `chain` lists every command queued with its `chainerId`, including the `.should()` ones, and `helpers` come from the first of them. When the log has no `chainerId`, or none of its commands was queued during the attempt, both come from the command running when the assertion ended, as in schema 1, and the event has `"chainSource": "current"`.
- `callSite` is where an `expect()` or `assert()` call was written, including one inside a `.should()` or `.then()` callback: `{"file", "line", "column"}`, from the first spec-bundle frame of the stack Cypress keeps for that call (`currentAssertionUserInvocationStack`), mapped to the source by Cypress's own source-map lookup. When that lookup gives nothing, it is `{"bundle", "line", "column"}` with the position in the spec bundle. Chainer assertions such as `.should("be.visible")` have none, because their stack holds no spec frame.
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
      "dumpSkipped": true when the cut asked for no backend dump, see below
      "dumpFailed": true when the cut's dump request failed in the browser
    }
  ]
}
```

Each cut holds what ran since the previous cut. The last cut, `end`, is taken in the same synchronous turn as the per-test flush, so it holds the rest of the attempt.

- Cuts happen inside Cypress event handlers (`window:before:load`, `url:changed`, `log:added`/`log:changed`, `command:end`). They never queue a Cypress command, so the command queue, retries and timing stay as they are. Everything is buffered in the browser and sent once, by the afterEach flush.
- `document` cuts come before the new page loads, `nav` cuts after every URL change, `assert` cuts when an assertion ends, `command` cuts when a command ends.
- The frontend cut reads the function counters (`f`) of every tracked app window and frame and compares them with the values at the previous cut. It doesn't zero them, so the per-test `f` is still read straight from the counters at the flush, which keeps the consistency check meaningful. The files each window has registered are kept in a list and only rescanned when the window registers new ones.
- A cut doesn't wait for the network. `inFlight` says how many app requests were still running, so a cut with requests in flight has a fuzzy boundary: their responses land in a later step. A `fetch` counts until its response headers arrive, an XHR until `loadend`.
- The backend can't be dumped synchronously from the browser. Each cut sends a fire-and-forget `POST` to a listener the Cypress config process runs on `127.0.0.1:6301` (path `/__journey-capture/backend-dump`), which dumps and resets the JaCoCo agent over its TCP port. Dumps run one at a time in the order they arrive. `latencyMs` is the time from the cut in the browser to the dump in the backend: code that runs in that interval lands in this step rather than the next. The request goes through Cypress's proxy like any browser request.
- A test sends at most one dump request per 250 ms. A cut less than 250 ms after the last request sends none and has `"dumpSkipped": true`, and its backend code lands in the next cut that has a dump, or in the final cut. Chrome fails keepalive requests once 256 are in flight for a page, and a burst of assertion cuts can send more than that. A request that fails in the browser dumps nothing either, so its code also lands in the next dump. Its cut gets `"dumpFailed": true` when the failure arrives before the flush.
- The final cut's backend is the per-test dump taken by the afterEach task, which first waits for the attempt's step dumps (`drainMs`). It waits as long as requests keep arriving or dumps keep finishing, stops after 10 s without either, and after 40 s in any case (`drainStop`). A request that arrives after that skips its dump, and its code lands in the next dump (`lateStepDumpRequests`).
- With step snapshots on, `backend.test` is the union of the cuts' dumps and has `"fromSteps": true`. Every dump resets the agent, so no independent per-test backend total exists.

#### Consistency check

`checkSteps()` in the reader, printed per shard in `summary.txt`, with the first 20 failing attempts listed:

- frontend: summing the cuts' deltas per function gives exactly the per-test `f`, which is read separately at the flush. Any difference means a cut missed code, for example a window or a lazily loaded file.
- backend: the attempt's dump windows (`beforeTest` and every cut) follow each other, and the cuts' dumps ran in cut order. The agent timestamps each reset right after writing the dump, so a gap between one window's end and the next one's start is time whose hits no dump holds. Writing a dump takes a few milliseconds, so small gaps are expected. The check reports them, and lists attempts whose gaps add up to more than 50 ms.
- backend: every cut except those with `dumpSkipped` has a dump. Cuts with `dumpSkipped` are counted as merged into the next dump, not as missing. Cuts whose request failed or never arrived are missing, and `failedRequests` counts the ones the browser saw fail.

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

## Secrets

The shards run with the staging licence tokens in their environment, and tests send them to the backend and type them into forms.
The capture itself leaves out `cy.request` arguments, the arguments of `{log: false}` commands and query strings, and masks the runner's secret environment variables and body keys named like secrets, as described in [Events](#events).
On top of that, every shard scrubs, checks and encrypts its data before it uploads anything.

### Scrub

Each shard runs `.github/actions/upload-journey-capture` as its `Scrub, encrypt and upload shard capture` step. The action's first step runs `e2e/coverage/journey-capture-scrub.mjs`. It is the only step with `toJSON(secrets)` in its environment. In every text file, the script replaces these with `<scrubbed>`:

- every secret of the workflow that is at least 16 characters long, also trimmed and line by line, in each of these spellings: as it is, JSON-escaped once and twice, URL-encoded, and base64, standard and URL-safe, at each of the three byte alignments. Any 20 characters of any of these spellings are replaced too, which catches a secret cut off by the 300-character clip
- JWTs: `eyJ` and at least three dot-separated parts
- tokens that start with `ghp_`, `gho_`, `github_pat_`, `dckr_pat_`, `mb_dev_` or `airgap_`, where the prefix doesn't follow a letter, digit, `_` or `$`, so class names such as `token_check$assert_airgap_allows_user_creation_BANG_` stay whole
- runs of 64 or more hex digits
- the value of a query parameter whose name contains `token`, `secret`, `password`, `passwd`, `session`, `jwt`, `api_key`, `auth`, `signature` or `credential`

JSON and JSONL files are scrubbed one string at a time, keys included, and written back with `JSON.stringify`, so they stay valid. The script then runs the verify step's search on the text it writes, because that text can hold a piece of a secret that no single string holds, across a JSON escape such as `\n` or the punctuation between two values. Each string, number or literal that a match touches becomes `"<scrubbed>"`. A match across JSONL lines replaces those lines, and a match that touches none of these replaces the whole file with `"<scrubbed>"`.

No rule touches 16- or 40-character hex (body hashes, JaCoCo class ids, commit SHAs), UUIDs or entity ids. Binary files, such as `.exec`, are never edited.

A secret shorter than 16 characters, or fewer than 20 characters of a longer one, stays.

### Verify

The same script then reads every file again. It looks for any spelling or 20-character piece of a secret in every file, text and binary, and for the token shapes in every text file and file name. Any hit, or anything that isn't a regular file or a directory, fails the step, and the shard encrypts and uploads nothing. The step prints counts, file names and secret names, never a value, and adds the reader's summary to the step summary only once the check has passed.

### Encryption

The action's `Encrypt capture` step packs the scrubbed directory as a gzipped tarball and encrypts it with age to every recipient in `e2e/journey-capture/age-recipients.txt`. Only that `.age` file is uploaded. age comes from its GitHub release, pinned in the step's `AGE_VERSION` and checked against `AGE_SHA256`.

While `age-recipients.txt` has no recipient, a run with `upload` on fails in `Build shard matrix`, before any shard runs, and every shard fails at its encryption step.

To add a key, run `age-keygen -o <identity file>` and add the public key it prints, the line starting with `age1`, to `age-recipients.txt`. Anyone with the identity file can read every run's data, so it stays with its owner.

To read a run, install age (`brew install age`) and let `fetch_journey.sh` download and decrypt it:

```
JOURNEY_AGE_IDENTITY=<identity file> e2e/coverage/journey/pipeline/fetch_journey.sh <run id> <run dir>
```

It fails when `JOURNEY_AGE_IDENTITY` isn't set. One shard by hand:

```
gh run download <run id> -n journey-capture-shard-<n> -D <download dir>
mkdir -p <run dir>/journey-capture-shard-<n>
age -d -i <identity file> <download dir>/journey-capture-shard-<n>.tar.gz.age | tar -xzf - -C <run dir>/journey-capture-shard-<n>
```

### Encryption check

A dispatch with `encryption_check: true` runs only the `Encryption check` job, which builds nothing and runs no tests.
It writes a dummy capture with no test data: a copy of this file, and `encryption-check.json` with the marker `journey-capture-encryption-check-marker` and a fake token of 64 hex digits.
Then it runs `.github/actions/upload-journey-capture` on that directory with upload on, the same action every shard runs on its capture.
The run's only artifact is `journey-capture-encryption-check`, kept for 1 day.

```
gh workflow run e2e-journey-capture.yml --ref <branch> -f encryption_check=true
```

The job's step summary has the scrub's counts, which include the fake token under `hex-64`. To check the artifact itself:

```
gh run download <run id> -D <download dir>
find <download dir> -type f
head -n 1 <download dir>/journey-capture-encryption-check/journey-capture-encryption-check.tar.gz.age
grep -r journey-capture-encryption-check-marker <download dir>
mkdir -p <check dir>
age -d -i <identity file> <download dir>/journey-capture-encryption-check/journey-capture-encryption-check.tar.gz.age | tar -xzf - -C <check dir>
cat <check dir>/encryption-check.json
```

What each command should show:

- `find` lists one file, `journey-capture-encryption-check.tar.gz.age`, so the run uploaded nothing else
- `head` prints `age-encryption.org/v1`, the header every age file starts with
- `grep` prints nothing
- `<check dir>` holds `README.md` and `encryption-check.json`, and `encryption-check.json` has the marker and `"token":"<scrubbed>"`

gzip alone also hides the marker from `grep`, so the `head` check is what shows the file is encrypted and not only compressed.

### Canary check

`e2e/coverage/journey-capture-canary.mjs` checks on real specs that no licence token reaches the capture output. Run it after changing the capture or the scrub.

It needs these, and checks for them before it starts:

- an EE backend for e2e on port 4000 (or `MB_JETTY_PORT`) with the testing endpoints, for example from `node e2e/runner/start-backend.js`
- the e2e snapshots in the backend's `e2e/snapshots`, and `e2e/support/cypress_sample_instance_data.json` and `cypress_sample_database.json` in this checkout. A normal local run such as `bun run test-cypress` writes them.
- an instrumented frontend: the dev server started with `INSTRUMENT_COVERAGE=true bun run build-hot`, or a build from `INSTRUMENT_COVERAGE=true bun run build-release:js`. The dev server listens on port 8080, or on the port in `MB_FRONTEND_DEV_PORT`
- no `cypress.env.json` in the repository root, because Cypress loads it into `cy.env()`

It also needs four of the e2e Docker containers, which it doesn't check for. The setup spec's `beforeEach` resets Snowplow Micro on port 9090, so when Snowplow Micro isn't running every setup test fails, including the one that types a token. Snowplow Micro reads event schemas from `iglu`. The saved spec's alert tests send email to maildev and webhooks to the webhook tester. To start all four:

```
docker compose -f e2e/test/scenarios/docker-compose.yml up -d snowplow-micro iglu maildev webhook-tester
```

Cypress uses Chrome unless `CYPRESS_BROWSER` names another browser.

```
node e2e/coverage/journey-capture-canary.mjs
```

It passes when the scrubbed copy has nothing the verify step would reject, and each spec recorded the events of its token routes. It exits with 0 on a pass, 1 on a fail, and 2 when a prerequisite is missing or it refuses to run. The report names files, rules and canary labels, never a value.

It sets each of the four token variables the e2e helpers read to a canary, a fake token for one label:

| Variable                           | Label             |
| ---------------------------------- | ----------------- |
| `CYPRESS_MB_ALL_FEATURES_TOKEN`    | `all-features`    |
| `CYPRESS_MB_STARTER_CLOUD_TOKEN`   | `starter-cloud`   |
| `CYPRESS_MB_PRO_CLOUD_TOKEN`       | `pro-cloud`       |
| `CYPRESS_MB_PRO_SELF_HOSTED_TOKEN` | `pro-self-hosted` |

Each canary is 64 hex digits like a real token and starts with `fa4e`. The Cypress runs get no other variable named or shaped like a secret, and the script stops before Cypress starts if one would get through.

It runs Cypress twice, with backend coverage off:

- `onboarding/setup/setup.cy.spec.ts` and `question/saved.cy.spec.js`, as a shard runs its tests, with `assertions` step snapshots. The setup spec types a token into the licence form, which sends it to the backend. The saved spec activates one with `H.activateToken`.
- the default snapshot creator, as a shard runs it. It also activates a token with `H.activateToken`.

The tests that need a valid token fail. The capture still records what they did up to the failure.

Then it looks for every spelling and 20-character piece of each canary with the scrub's `verifyDir`, in two places:

1. the output as the capture wrote it. This is for information: it shows what the capture lets through before the scrub.
2. a copy scrubbed with `scrubDir`, as the workflow scrubs a shard.

The snapshot creator only works on an instance that isn't set up, so the script restores the `blank` snapshot first. The creator also overwrites the snapshots, and with a canary it stops before it writes the instance data that goes with them. The script puts both back when the runs end.

Everything else goes to a new temporary directory, whose path it prints. `raw/` holds the capture output, with the `meta.json` and `summary.txt` the workflow adds, and `scrubbed/` holds the scrubbed copy.

## Size

Schema 1 measured, on the full `assertions` run 36089233978 (5,141 attempts over 100 shards, 48 per shard): a median attempt of 350 KB raw, a median shard of 31.6 MB raw and 6.8 MB gzipped (13.3 MB at most), and 3.4 GB raw, 0.72 GB gzipped for the run. `meta.json` (`sizeBeforeMetadata`) and each shard's step summary give the numbers of any run.

Schema 2 adds, per attempt, 45 to 60 KB raw and 11 to 15 KB gzipped: 35 to 50 KB of `branchHits` (3,500 to 5,000 hit arms, estimated from the 3,500 functions a median attempt fires and the one two-armed branch per function in a sample of `frontend/src/metabase`), about 9 KB for the attempt's share of its spec's `branchFiles`, about 4 KB of `cy.request` bodies and 3 KB of `chainerId`s. Merging cuts into fewer backend dumps takes about 5 KB raw off. Each `branchmap-*.json` is about 0.56 times the size of its `fnmap`, about 3 MB raw and 0.45 MB gzipped per shard. That puts a median `assertions` shard at about 37 MB raw and 8 MB gzipped, and the run at about 4 GB raw and 0.85 GB gzipped.

| Setting                      | Per test, raw | Per shard, zipped | Whole run (100 shards), zipped |
| ---------------------------- | ------------- | ----------------- | ------------------------------ |
| `step_snapshots: none`       | 200-350 KB    | 5-10 MB           | 0.5-1 GB                       |
| `step_snapshots: assertions` | 350-700 KB    | 7-15 MB           | 0.8-1 GB                       |
| `step_snapshots: commands`   | 0.5-1.1 MB    | 9-16 MB           | 0.9-1.6 GB                     |

About 4 to 6 MB of each zipped shard is fixed: the baseline `.exec` files (the boot dump alone is about 4 MB raw), `backend/classes.jsonl` and `fnmap`. Unzipped is roughly four to six times larger. `compare_step_snapshots` adds the `none` size of the tests again. `keep_test_exec` adds 0.5 to 2 MB per test, so it is only meant for a few specs. The run-level `journey-capture-cljs` artifact is about 10 MB zipped.

## Reading a run

```
JOURNEY_AGE_IDENTITY=<identity file> e2e/coverage/journey/pipeline/fetch_journey.sh <run id> <run dir>
node e2e/coverage/journey-capture.mjs <run dir> [--subtract] [--baselines <name,...>] [--compare <other run dir>]
```

It prints, per shard: counts, recording errors, the step consistency check, the timing comparison against `tests-control/` and against `--compare`, and the backend baselines. `<run dir>` can also be a single shard directory.

As a library it exports `shardDirs()`, `loadShard()`, `iterateRun()` (one shard at a time), `subtractBaselines()`, `checkSteps()`, `compareTiming()`, `firedBranches()` (an attempt's branch arms as `file#branch:arm` keys), `assertionChains()` (each assert event with the events of its chain) and `attemptTestIds()` (each attempt's test id, with ` [n]` on the nth test of a spec that repeats a title). It reads schema 1 to 3 artifacts. Subtraction is per shard, because every shard has its own backend:

- frontend functions: drop functions the chosen baselines fired (default `coverage-baseline`, both rounds)
- frontend branch arms: drop arms the same baselines ran
- routes: drop routes the chosen baselines requested
- backend classes: drop classes seen in the chosen Cypress baselines and in `backend-idle` (both positions)

`--baselines coverage-baseline-premium-token` subtracts the premium-token baseline instead.

## Known gaps

- Frontend counters are read from the top app window and its same-origin frames. Code in a frame on another origin has no function counts, like the app inside the page `embedding-dashboard.cy.spec.js` loads from Cypress's file server. Its requests still appear in `events` and `routes`. Schema 1 and 2 artifacts have counters from the top window only.
- Background jobs in the backend land in whichever test is running. The idle windows measure how much that is.
- The nightly `routes` have no `cy.request` traffic. In CI, `cypress-terminal-report` also overwrites `request`, and Cypress's `Commands.overwrite` wraps the original command rather than the previous overwrite, so the last overwrite wins. Journey capture records `cy.request` from `command:start` instead, and `capture.requestOverwrites` shows whether the overwrite ran.
- App requests made in a suite-level `before()` hook have no body fields: no intercept is live then, and the `fetch` and `xhr` wrappers don't read bodies.
- Against a hot dev build (`bun run build-hot`), the capture's `cy.intercept` leaves out the `.hot.bundle.js` and `.hot-update.js` files, so their loads aren't in `routes` or the events. Cypress sends every intercepted response to the browser over its DevTools connection, and Chrome closes that connection on a message over 100 MiB, which the response of an instrumented hot bundle exceeds.
