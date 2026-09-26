# E2E journey analysis

Two tools that read the runs of `.github/workflows/e2e-journey-capture.yml` through the capture reader, `e2e/coverage/journey-capture.mjs`. The capture and its format are described in `e2e/journey-capture/README.md`.

- **Step-graph pipeline** (`pipeline/`): turns a whole run into a step graph and an overlap analysis. It lines tests up by the commands they run, in order, and says which pairs share a path, checks and code. Given a kills file, it also gives each test a keep, provisional-keep, delete or unmeasured verdict.
- **Reach lookup** (`lookup/`): given a code location, lists the tests that reach it, and the ones that reach it and then assert. Given a kills file and a list of candidates, `pipeline/kills.py` uses its index to give each candidate the same verdicts without a pipeline run. Given a location prior as well, it can also give an unmeasured candidate an accepted verdict.

Both need `bun install` to have run, for `typescript` and `micromatch`.

## Test ids

An e2e test is `<spec path>::<full title>`, where the full title is Mocha's `fullTitle()`: the describe titles and the `it` title joined by spaces.

```
e2e/test/scenarios/question/saved.cy.spec.js::scenarios > question > saved should duplicate a saved question into a collection
```

When a spec has two tests with the same full title, the pipeline keys the second one `<id> [2]`, the third `<id> [3]`, and so on. A kills file uses the id without the suffix, which matches every test with that title.

In a kills file, a jest test is `<spec path>::<jest fullName>` and a Clojure test is `<namespace>/<var>`.

## Step-graph pipeline

```
e2e/coverage/journey/pipeline/run_all_journey.sh <run id | run dir> [--out <dir>] [--rerun <run id | run dir>]...
    [--backend-baseline union|shard] [--kills <file>] [--min-mutants <k>] [--require-strata <s,...>]
```

A run id is downloaded with `gh` into `$JOURNEY_ANALYSIS_DIR/<run id>/artifacts`, and an interrupted download picks up where it stopped. A run dir is one you downloaded yourself:

```
gh run download <run id> -p 'journey-capture-shard-*' -p journey-capture-openapi -D <run dir>
```

The steps, in order:

1. `repo_files.sh` copies the module boundaries, the API route maps and the backend module config at the run's commit.
2. `extract.mjs` reads the run one shard at a time, keeps each test's final attempt and subtracts the baselines. It writes each test's code (frontend functions and branch arms, backend classes, API routes, pages), its path of Cypress commands and `cy.request` calls, and its step cuts with the code and assertions each one holds.
3. `static-tests.mjs` parses the specs at the run's commit, and `static_align.py` ties recorded assertions to source lines and finds the describes with `before` hooks.
4. `graph.py` builds the step graph: a prefix tree over the tests' paths, at an exact and a normalized level.
5. `overlap.py` measures overlap at every granularity, a duration-weighted cover, duplicate verdicts and, with `--kills`, the kills-first cover and deletion verdicts.
6. `report.py` prints the headline numbers and a few example pairs.

| Option               | Meaning                                                                                                  |
| -------------------- | -------------------------------------------------------------------------------------------------------- |
| `--out <dir>`        | where the outputs go, default `$JOURNEY_ANALYSIS_DIR/<run id or run dir name>`                            |
| `--rerun <run>`      | a rerun of failed tests. It replaces tests that never passed in the main run, and gives second samples of the others |
| `--backend-baseline` | `union` (default) also drops backend classes that any shard's coverage baseline ran. `shard` subtracts each shard's own baseline only |
| `--kills <file>`     | a kills file, below                                                                                      |
| `--min-mutants <k>`  | qualifying mutants a delete verdict needs, default 5                                                     |
| `--require-strata`   | coarse strata a delete verdict needs among them, default `logic,wiring`                                  |
| `--fe-code`          | what the duplicate verdicts' frontend Jaccard compares: `functions` (default), `branches` (branch arms) or `both` |
| `--cover-branches`   | also break the kills-first cover's ties on branch arms                                                   |

| Environment variable   | Meaning                                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------------------------- |
| `JOURNEY_ANALYSIS_DIR` | downloads, outputs and the Python environment. Default `journey-analysis/` at the repo root, which is gitignored |
| `JOURNEY_PYTHON`       | a Python with `numpy` and `scipy`. Without it, the driver makes a virtualenv in `$JOURNEY_ANALYSIS_DIR/.venv` |
| `OPENAPI`              | the `openapi.json` to match routes against, default the run's `journey-capture-openapi` artifact           |
| `REPO_SLUG`            | where to download from, default `metabase/metabase`                                                      |

Static alignment needs the run's commit in the local clone. Without it, assertions are keyed by their message only, and a describe's `before` hooks count only for the test that ran them.

### Schema 2 captures

The pipeline reads schema 1 and schema 2 captures. From a schema 2 capture it also uses:

- **`cy.request` bodies.** A `cy.request` token carries its body: at the exact level a hash of the canonical body with run-varying values masked, as in command arguments, and at the normalized level the body with ids masked too. A body the capture clipped keeps the capture's own hash at the exact level, marked `~raw`, and that hash changes with any uuid or timestamp in the body. Two tests that set up different fixtures through the API no longer share a path. Two whose fixtures differ only in ids share it at the normalized level only.
- **Each assertion's own chain.** An `expect()` or `assert()` with a call site is keyed by that `file:line` and its message, and a `.should()` on its own chain by that chain and its message. Assertions with `"chainSource": "current"` are keyed as in schema 1. `static_align.py` ties an assertion with a call site to the source assertions on that line, whatever its message.
- **Branch arms**, as the `branches` granularity and through `--fe-code` and `--cover-branches`. A schema 1 run has none, and both options fall back to functions. Arms are recorded per test, not per step, so a describe's `before` hooks add theirs to the test that ran them only.
- **Merged backend dumps.** A cut with `dumpSkipped` or `dumpFailed` has its backend code in the next dump taken, and every cut of that span holds the dump's classes. After a describe's `before` hooks, that dump is `beforeTest`. These cuts count as merged in the capture problems, not as missing.

### Outputs

| File                          | Content                                                                                   |
| ----------------------------- | ----------------------------------------------------------------------------------------- |
| `report.txt`                  | the headline numbers: run, shards, capture problems, graph shape, overlap, covers, verdicts |
| `journey-graph.json`          | the step graph at both levels, and every test's path through it                            |
| `journey-overlap.json`        | overlap per granularity, covers, duplicate verdicts and deletion verdicts                  |
| `graph.txt`                   | the graph's shape and its most shared prefixes                                             |
| `work/`                       | the extracted run: `tests.jsonl`, `vocab.json`, `modules.json`, `extract-summary.json`, `second-samples.json`, `static-align.json` |
| `static/`, `src/`             | the parsed specs and the repo files at the run's commit                                    |

To compare two tests, given by id, by their `id` in `work/tests.jsonl` or by a unique part of the id:

```
$JOURNEY_ANALYSIS_DIR/.venv/bin/python e2e/coverage/journey/pipeline/show_pair.py <out>/work <test A> <test B> [--level exact|normalized] [--json]
```

### Kills file

`--kills` takes one entry per mutant:

```
{
  "<mutant id>": {
    "killed_by": ["<test id>", ...],
    "unconfirmed_by": ["<test id>", ...],
    "errored": ["<test id>", ...],
    "ran": ["<test id>", ...],
    "stratum": "logic" | "intra-frontend-wiring" | "store-state" | "boundary-wiring" | "server-state" | "cross-page-timing" | "browser-measurement",
    "stratum_coarse": "logic" | "wiring" | "state" | "baseline",
    "origin": "<regression id>" | "synthetic",
    "file": "<repo-relative path>"
  }
}
```

- `killed_by` holds confirmed kills only: an assertion failure on a test that passes on clean code, reproduced on a rerun.
- `unconfirmed_by` holds e2e kills seen once but not reproduced on a rerun. They never count towards a keep or a delete.
- `errored` holds tests that failed for another reason, like a crash, a timeout or a setup failure. They are never kills.
- A miss is `ran` minus `killed_by` minus `errored`. A test missing from `ran` says nothing about that mutant.
- A mutant's coarse stratum is its `stratum_coarse`. Without one, it's the coarse stratum of its `stratum` from this table, or else its `stratum` as written. `--require-strata` and the baseline check compare coarse strata, and a baseline mutant is one whose coarse stratum is `baseline`.

  | `stratum`                                                     | Coarse stratum |
  | ------------------------------------------------------------- | -------------- |
  | `logic`                                                       | `logic`        |
  | `intra-frontend-wiring`, `boundary-wiring`, `browser-measurement` | `wiring`   |
  | `store-state`, `server-state`, `cross-page-timing`            | `state`        |
- `file` is optional. With it, a mutant counts towards a test's delete verdict only when the test ran a function of that file, or a class of that namespace for `.clj` and `.cljc`. Without it, being in `ran` counts as reaching the mutant.
- An entry that is a bare list of test ids is read as `killed_by`, with `ran` unknown.
- Over the reach index instead of a run, a mutant can also carry a `location` or `locations`. See [Verdicts from a kills file](#verdicts-from-a-kills-file).

Only the run's e2e tests get a verdict. Every other id, including jest and Clojure tests, counts as a remaining test:

- **keep:** the test has a kill no other test has, or the kills-first cover keeps it for kills it shares only with other tests of the run.
- **provisional-keep:** not a keep, but the test has an unconfirmed kill no other test has, or the kills-first cover keeps it for unconfirmed kills it shares only with other tests of the run. For every mutant that only tests of the run kill, the cover keeps one test in its `killed_by`, or one in its `unconfirmed_by` when `killed_by` is empty, so an unconfirmed kill blocks a delete but never makes a keep.
- **delete:** no unique kill, at least `--min-mutants` qualifying mutants, every `--require-strata` stratum among them, and the baseline check passed. A qualifying mutant sits in the test's reached code, the test ran against it without erroring, and at least one other test ran against it too. The baseline check passes with a confirmed kill among the qualifying mutants, or a run against a baseline mutant without erroring, because only a baseline mutant run shows whether a test that kills nothing it reaches still guards boot. A test that fails it is unmeasured, with the reason "needs a baseline check".
- **unmeasured:** anything else, including a test missing from the kills file, a mutant whose `ran` is unknown, and a test that failed in the capture.
- **accepted:** an unmeasured test deleted on a stated risk, never a measured delete. Only `kills.py` over the index gives it, and only with a location prior. See [Accepted verdicts](#accepted-verdicts).

## Reach lookup

```
node e2e/coverage/journey/lookup/lookup.mjs --index <index dir> [options] <location> [<location> ...]
node e2e/coverage/journey/lookup/lookup.mjs --index <index dir> [options] --locations <file with one location per line>
```

The index comes from `--index` or `JOURNEY_LOOKUP_INDEX`. It has no default: a full run's index is about 140 MB, so keep it outside the repo.

### Locations

| Form                                                   | Meaning                                                                                                     |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `frontend/src/metabase/foo/Bar.tsx#Bar`                | a frontend function by name. Arrow functions take the name of the variable, property or `memo`/`forwardRef` wrapper they're assigned to |
| `frontend/src/metabase/foo/Bar.tsx:120`                | the innermost function around line 120                                                                      |
| `metabase.parameters.params/find-card-for-mapping`     | a backend var                                                                                               |
| `src/metabase/parameters/params.clj:361`               | the top-level form around line 361: a `defn`, `defmethod`, `defendpoint` or anything else                    |
| `frontend/src/metabase/foo/Bar.tsx`                    | every function of a frontend file, or every class of a Clojure file's namespace. A `.cljc` file adds its browser copy's functions. In JSON, `{"file": ...}` or `{"ns": ...}` with nothing else |
| `{"file": ..., "fn": ..., "line": ..., "column": ...}` | JSON. With `line` and `column`, the function Istanbul records at exactly that position                     |
| `{"ns": ..., "var": ..., "line": ...}`                 | JSON. `var` can be `"<multifn> <dispatch>"` for a `defmethod` or `"<:method> <route>"` for a `defendpoint` |

Line numbers are for the commit the run captured (`meta.json`'s `sha`). Source is read from that commit with `git show`, so the repo needs it.

### What it matches

- **Frontend:** the function's Istanbul counter in the per-test coverage, after the reader's baseline subtraction for the test's shard. Some inner functions have no counter in the build. The nearest enclosing function that has one stands in, and the output says so.
- **Backend:** the JVM classes of the var, which are `<ns with - as _>$<munged var>` and its inner `$fn__N` classes. With `lines.json` in the index, a top-level form owns every class whose line range sits inside it, which also covers `defmethod` and `defendpoint` bodies. The backend baseline is the union of every shard's `coverage-baseline` classes.
- **`.cljc` forms:** both the backend classes and the browser copy's functions whose source map origin lies inside the form (`cljs-origins.json`).

A test **reaches** a location when its chosen attempt ran any of those functions or classes. It **reaches and asserts** when a later passing assertion exists in the same test. `assertsAfter` counts the passing assertions from the first step cut that held the location, including the assertion that triggered that cut. Assertions in `after` hooks don't count.

Each test contributes one attempt: the last passing attempt of the main run, else a passing attempt of a rerun, else its last attempt. Tests with no passing attempt are left out of the results and listed separately.

### Options

| Option                  | Meaning                                                                    |
| ----------------------- | -------------------------------------------------------------------------- |
| `--index <dir>`         | the index, or `JOURNEY_LOOKUP_INDEX`                                       |
| `--repo <path>`         | the git repo for source reads, default the one this folder is in           |
| `--sha <commit>`        | read source at this commit instead of the captured one                     |
| `--exclude <file>`      | test ids to leave out, one per line                                        |
| `--union`               | one result for all locations together, instead of one per location        |
| `--json`                | one JSON line per result: `reach`, `reach_and_assert`, `asserts_after`, `not_passing` and the resolved `locations` |
| `--include-not-passing` | count tests with no passing attempt                                        |

### Verdicts from a kills file

`pipeline/kills.py` gives each candidate a keep, provisional-keep, delete, unmeasured or accepted verdict from a kills file and this index, with no pipeline run. It needs Python 3.9 or later and `node`, and reads the index through `lookup/reach.mjs`.

```
python3 e2e/coverage/journey/pipeline/kills.py --index <index dir> --kills <file> --candidates <file or test id> [--candidates ...]
    [--min-mutants <k>] [--require-strata <s,...>] [--prior <file>] [--callers <file>] [--ci-history <file>] [--accept-cap <k>]
    [--max-prior <x>] [--out <json file>] [--repo <path>] [--sha <commit>]
```

| Option                      | Meaning                                                                                                   |
| --------------------------- | --------------------------------------------------------------------------------------------------------- |
| `--index <dir>`             | the index, or `JOURNEY_LOOKUP_INDEX`                                                                       |
| `--kills <file>`            | a [kills file](#kills-file)                                                                                |
| `--candidates <file or id>` | the tests proposed for deletion. A file holds one test id per line, a JSON list, or JSON lines with a `deleted_test` or `id` field. Anything else is read as one test id. Repeat it for more |
| `--min-mutants <k>`         | qualifying mutants a delete verdict needs, default 5                                                       |
| `--require-strata`          | coarse strata a delete verdict needs among them, default `logic,wiring`                                    |
| `--prior <file>`            | the location prior, which an accepted verdict needs. See [Accepted verdicts](#accepted-verdicts)           |
| `--callers <file>`          | the files of each candidate's direct callers, keyed by test id. The prior then covers them too. See [Accepted verdicts](#accepted-verdicts) |
| `--ci-history <file>`       | CI failure history keyed by test id, at the top level or under `tests`. Each candidate's entry is recorded on its acceptance and never decides it |
| `--accept-cap <k>`          | accepted verdicts one module can take, default 2                                                           |
| `--max-prior <x>`           | the highest prior an accepted verdict can have, default 0.5                                                |
| `--out <file>`              | where to write the full result as JSON                                                                     |
| `--repo`, `--sha`           | as for `lookup.mjs`                                                                                        |

The verdict rules are the pipeline's, and run through the same code. What differs:

- **Candidates:** only the tests given with `--candidates` get a verdict. Every other id in the kills file is a remaining test, including e2e tests that aren't candidates. A candidate that isn't in the index is still a candidate, and it's unmeasured unless it has a unique kill, confirmed or not.
- **Reach:** a mutant's location is its `locations` list, its `location`, or its own `file`, `fn`, `line`, `column`, `ns` and `var`, in any form from [Locations](#locations). A candidate reaches the mutant when it ran a function or class the location resolves to, so reach is per function where the pipeline's is per file. A `file` with nothing else means the whole file, as in the pipeline. No candidate reaches a location that resolves to nothing.
- **No location:** a mutant without one counts as reached by every candidate that ran against it, as in the pipeline, and the output marks it: under `reach` for the mutant, and in `qualifying_without_location` for each candidate.
- **Cover:** the index has no durations or assertion text, so when the kills-first cover chooses between candidates that share kills, it breaks ties on reached code, then on the order of `--candidates`.

It prints a short report, with the accepted verdicts in a section of their own. With `--out`, it also writes JSON with these keys:

- `candidates`: for each candidate, the verdict and reason, `unique_kills`, `unconfirmed_unique_kills`, `cover_kept_for` (the mutants the kills-first cover keeps it for) and `qualifying_mutants` by stratum, `qualifying_without_location`, the number of `kills` and `misses`, and the mutants it `errored` on. An unmeasured or accepted candidate also has an `acceptance`, below
- `accepted`: the accepted verdicts on their own, below
- `summary`: verdicts, reasons, and candidates per stratum
- `mutants`: for each mutant, its stratum, how its reach was decided, what each location resolved to, and how many candidates reach it
- `kills_cover`: the candidates the cover keeps
- `kills`: counts by stratum and by reach, and the kills file's e2e ids that aren't in the index
- `candidates_not_in_index`

#### Accepted verdicts

An accepted verdict is an unmeasured test deleted on a stated risk. It's never a measured delete, which is why the report and the JSON keep it apart from the other verdicts.

An unmeasured candidate that passed in the capture becomes accepted when it has all four fields:

| Field     | Meaning                                                                                                   |
| --------- | --------------------------------------------------------------------------------------------------------- |
| `prior`   | the highest `score` the location prior gives the files of its qualifying mutants' locations, and the files of their direct callers when `--callers` is given. The index resolves each location to its file |
| `sampled` | n, the number of its qualifying mutants                                                                    |
| `bound`   | 3/n, the rule of three. Remaining tests killed all n, so their miss rate at those locations is below 3/n at 95% confidence. It's missing while n is 3 or less, where 3/n bounds nothing |
| `module`  | the location prior's module for each file of its qualifying mutants' locations. The index has no modules, so they come from the prior |

It also needs:

- a prior of at most `--max-prior`, default 0.5, which is no file above the median when the score is a percentile.
- a confirmed kill by a remaining test on every one of its n qualifying mutants. A remaining test is one that isn't a candidate, and a sampled mutant that none kills is a survivor, with the outcome `survivor in sample`.
- the baseline check, as for delete.

Each module takes at most `--accept-cap` accepted verdicts, default 2, so one wrong prior takes at most two tests out of a module before an escape there brings them back. Candidates are taken lowest prior first, then lowest bound, then in `--candidates` order. A candidate whose files span several modules counts against each of them.

A keep or provisional-keep is never accepted, and neither is a candidate that didn't pass in the capture.

The location prior is JSON keyed by repo-relative file, with a rollup per module:

```
{
  "meta": {"base_commit": "<sha>"},
  "files": {
    "<path>": {"module": "<module>", "relative_churn": ..., "fix_commits": ..., "corpus_regressions": ..., "score": <0 to 1, higher is riskier>}
  },
  "modules": {"<module>": {..., "score": ...}}
}
```

Only `score` and `module` decide anything. A file missing from the prior, or one without a `score` or a `module`, leaves that field missing.

Each acceptance's `prior_over` says what the prior covers: `reached files`, or `reached files plus direct callers` with `--callers`. Modules come from the reached files alone.

**Static importers:** when the location prior has a graph file beside it, named `<prior name>-graph.json`, each acceptance records the static importers of its reached files. That's the files that import them and, through a barrel, the files that import the barrel. They're information only and never change the prior, because importing a file isn't calling the function that changed. The record is a summary, since one file can have hundreds of importers: `role` (`information only`), `count`, `unscored` (how many the prior has no score for), the highest score as `max`, and the 10 highest-scored importers in `highest`.

```
{"barrels": ["<path>", ...], "importers": {"<path>": ["<importing path>", ...]}}
```

**Direct callers:** with `--callers`, the prior also covers the files of the direct callers of the functions a candidate's qualifying mutants sit in. The file is JSON keyed by test id, and nothing produces it yet:

```
{"<test id>": ["<caller path>", ...]}
```

The prior's `callers` holds their scores. A candidate without an entry has no prior, and one with an empty list has no direct callers.

Every unmeasured candidate's `acceptance` has the four fields, `prior_over`, `importers` when the prior has a graph file, `missing` with each missing field and why, the `survivors` in its sample, an `outcome`, and its `ci_history` entry when `--ci-history` is given. The `outcome` is one of `accepted`, `missing fields`, `never: did not pass in the capture`, `survivor in sample`, `needs a baseline check`, `prior above the maximum` or `over the module cap`.

The top-level `accepted` key has:

- the settings: `cap`, `max_prior`, the `bound` rule, the `prior` file with its `base_commit`, what it covers, the `callers` file, the `graph` file and the `importers` role, and the `ci_history` file
- `candidates`: each accepted candidate with its `acceptance`
- `modules`: for each module that accepted a candidate or turned one away at the cap, those candidates and the rollup's `prior`
- `outcomes`: the number of unmeasured and accepted candidates with each outcome
- `missing`: among the candidates with `missing fields`, the number missing each field

The tests run a synthetic kills file through both this command and the pipeline's verdicts, and a synthetic location prior through the accepted verdict. They need the index of run 36089233978:

```
JOURNEY_LOOKUP_INDEX=<index dir> python3 e2e/coverage/journey/pipeline/test_kills.py
```

### Building an index

```
node e2e/coverage/journey/lookup/build-index.mjs --run <run dir> [--rerun <run dir> ...] --out <index dir>
node e2e/coverage/journey/lookup/build-lines.mjs --jar <metabase.jar from journey-capture-uberjar> --index <index dir>
node e2e/coverage/journey/lookup/build-cljs-origins.mjs --maps <journey-capture-cljs dir> --index <index dir>
```

A run dir holds the run's `journey-capture-shard-*` artifacts. To start from a run id, download them first, with `gh run download <run id> -p 'journey-capture-shard-*' -D <run dir>` or `e2e/coverage/journey/pipeline/fetch_journey.sh <run id> <run dir>`. `build-index.mjs` takes about a minute for a 100-shard run.

The other two steps are optional. Without `lines.json`, backend matching is by var name only, which misses `defmethod` bodies. Without `cljs-origins.json`, `.cljc` forms have no browser side. GitHub keeps the uberjar artifact for one day only.

### Index files

| File                | Content                                                                                                       |
| ------------------- | ------------------------------------------------------------------------------------------------------------- |
| `meta.json`         | runs, captured sha, counts                                                                                     |
| `tests.json`        | per test: id, spec, title, run, shard, attempt, state, passing assertion count                                  |
| `keys.json`         | the keys (`fe:<file>#<fnIndex>` or `be:<class>`) with offsets into `postings.bin`                              |
| `postings.bin`      | per key, `uint32` pairs: test index, and 1 + assertions after the first cut holding the key (0 when no cut held it) |
| `fnmap.json`        | Istanbul function names and positions per file                                                                 |
| `baseline.json`     | the subtracted backend classes, and per frontend function the number of shards whose baseline fired it        |
| `lines.json`        | per backend class: source file name, first and last line                                                       |
| `cljs-origins.json` | per browser cljs function: source path and line                                                                |

### Limits

- **Granularity:** reach is per function or class, not per line or branch. A test that calls a function without taking the changed branch still counts.
- **Iframes:** frontend counters come from the top window only. Tests that run the app inside an iframe (interactive embedding, the SDK iframe) have no frontend coverage and never show frontend reach.
- **Baseline:** a function in every shard's baseline is subtracted from every test, so it shows no reach at all. The output notes this.
- **Background jobs:** backend code from background jobs lands in whichever test was running.
- **Assertions:** an assertion counts whether or not it checks anything the location affects.
