# E2E journey analysis

Two tools that read the runs of `.github/workflows/e2e-journey-capture.yml` through the capture reader, `e2e/coverage/journey-capture.mjs`. The capture and its format are described in `e2e/journey-capture/README.md`.

- **Step-graph pipeline** (`pipeline/`): turns a whole run into a step graph and an overlap analysis. It lines tests up by the commands they run, in order, and says which pairs share a path, checks and code. Given a kills file, it also gives each test a keep, provisional-keep, delete or unmeasured verdict.
- **Reach lookup** (`lookup/`): given a code location, lists the tests that reach it, and the ones that reach it and then assert. Given a kills file and a list of candidates, `pipeline/kills.py` uses its index to give each candidate the same verdicts without a pipeline run, or gives them from a PR's kills file and a candidates file with no index. Given a location prior as well, it can also find an unmeasured candidate eligible for risk acceptance. `lookup/ledger.mjs` joins the index and a kills file into one row per code location.

Both need `bun install` to have run, for `typescript` and `micromatch`.

## Test ids

An e2e test is `<spec path>::<full title>`, where the full title is Mocha's `fullTitle()`: the describe titles and the `it` title joined by spaces.

```
e2e/test/scenarios/question/saved.cy.spec.js::scenarios > question > saved should duplicate a saved question into a collection
```

When a spec has two tests with the same full title, the pipeline and the index key the second one `<id> [2]`, the third `<id> [3]`, and so on, in the order they ran, which is their order in the spec. A kills file uses the id without the suffix, which matches every test with that title.

In a kills file, a jest test is `<spec path>::<jest fullName>` and a Clojure test is `<namespace>/<var>`.

## Step-graph pipeline

```
e2e/coverage/journey/pipeline/run_all_journey.sh <run id | run dir> [--out <dir>] [--rerun <run id | run dir>]...
    [--backend-baseline union|shard] [--kills <file>] [--min-mutants <k>] [--require-strata <s,...>]
```

A run id is downloaded with `gh` into `$JOURNEY_ANALYSIS_DIR/<run id>/artifacts` and decrypted with `$JOURNEY_AGE_IDENTITY`, and an interrupted download picks up where it stopped. A run dir is one you downloaded and decrypted yourself:

```
JOURNEY_AGE_IDENTITY=<identity file> e2e/coverage/journey/pipeline/fetch_journey.sh <run id> <run dir>
```

The shard artifacts are encrypted, as described in `e2e/journey-capture/README.md` under "Secrets".

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
| `JOURNEY_AGE_IDENTITY` | the age identity file that decrypts the shard artifacts. Needed to download a run id                    |
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
    "symptom_kills": ["<test id>", ...],
    "unconfirmed_by": ["<test id>", ...],
    "symptom_unconfirmed_by": ["<test id>", ...],
    "errored": ["<test id>", ...],
    "ran": ["<test id>", ...],
    "stratum": "logic" | "intra-frontend-wiring" | "store-state" | "boundary-wiring" | "server-state" | "cross-page-timing" | "browser-measurement",
    "stratum_coarse": "logic" | "wiring" | "state" | "baseline",
    "origin": "<regression id>" | "synthetic",
    "equivalent_suspect": true,
    "equivalence": {"reason": ..., "limits": ..., "reviewed_by": "<analyst>", "approved_by": "<approver>", "date": ...,
                    "reviewed_sha": "<commit>", "patch_sha256": "<digest>", "observation_scope": ..., "code_refs": [...]},
    "scope_decision": {<the fields of equivalence>, "decision": ...},
    "not_equivalent": {"reason": ..., "approved_by": "<approver>", "date": ..., "patch_sha256": "<digest>"},
    "file": "<repo-relative path>"
  }
}
```

That is the flat format. [Format 2](#format-2-and-layer-roles) wraps the same entries with a `meta`.

- `killed_by` holds confirmed kills only: a failure on a test that passes on clean code, reproduced on a rerun. The failure is an assertion, or the bug's own symptom, such as a `cy.wait` timeout for a request the mutant never sends or a click on a control the mutant leaves disabled.
- `symptom_kills` lists the tests in `killed_by` whose failure was the bug's symptom. They count as kills everywhere, and the list only marks them, because a timeout or retry change can lose a symptom kill.
- `unconfirmed_by` holds e2e kills seen once but not reproduced on a rerun. They never count towards a keep or a delete.
- `symptom_unconfirmed_by` lists the tests in `unconfirmed_by` whose failure was the bug's symptom.
- A missing `symptom_kills` or `symptom_unconfirmed_by` means none. An id in `symptom_kills` that isn't in `killed_by`, or in `symptom_unconfirmed_by` but not `unconfirmed_by`, is ignored, and the output counts it.
- `errored` holds tests that failed for another reason, like a crash, a harness error, a setup failure, or a failure on clean code. They are never kills.
- The type checker and the contract checker have no test id. One of them kills the mutant when `killed_at_layer` is its layer, `tsc` or `contract`, and `kill_confirmed` is true, or when `layer_results.tsc` or `layer_results.contract` has the result `killed`. `killed_at_layer` names only the cheapest layer, so a contract kill under a type checker kill shows only in `layer_results`. An unconfirmed checker kill doesn't count, and a mutant whose two records disagree is listed as a data warning.
- A miss is `ran` minus `killed_by`, `errored` and `unconfirmed_by`. A test missing from `ran` says nothing about that mutant, and an error, an unconfirmed kill or a static exclusion is never a miss.
- A mutant's coarse stratum is its `stratum_coarse`. Without one, it's the coarse stratum of its `stratum` from this table, or else its `stratum` as written. `--require-strata` and the baseline check compare coarse strata, and a baseline mutant is one whose coarse stratum is `baseline`.

  | `stratum`                                                     | Coarse stratum |
  | ------------------------------------------------------------- | -------------- |
  | `logic`                                                       | `logic`        |
  | `intra-frontend-wiring`, `boundary-wiring`, `browser-measurement` | `wiring`   |
  | `store-state`, `server-state`, `cross-page-timing`            | `state`        |
- `file` is optional. With it, a mutant counts towards a test's delete verdict only when the test ran a function of that file, or a class of that namespace for `.clj` and `.cljc`. Without it, being in `ran` counts as reaching the mutant.
- `equivalent_suspect: true` marks a mutant the corpus suspects is equivalent: it behaves like the original code, so no test can kill it. A missing field means not suspected. See [Suspected equivalent mutants](#suspected-equivalent-mutants) for what the verdicts do with it.
- `equivalence`, `scope_decision` and `not_equivalent` resolve a suspected equivalent mutant, and a mutant carries at most one of them. See [Suspected equivalent mutants](#suspected-equivalent-mutants).
- An entry that is a bare list of test ids is read as `killed_by`, with `ran` unknown.
- Over the reach index instead of a run, a mutant can also carry a `location` or `locations`. See [Verdicts from a kills file](#verdicts-from-a-kills-file).

#### Format 2 and layer roles

Format 2 wraps the entries with a `meta`, and records the revisions each observation rests on:

```
{
  "meta": {
    "format": 2,
    "base": "<commit>",
    "emitted_at": "<time>",
    "emitter": {"script": "<path>", "sha": "<commit>"},
    "layer_roles": {"e2e_base": "removed", "e2e_head": "remaining", "jest_head": "remaining", "jest_base": "reference"}
  },
  "mutants": {"<mutant id>": {..., "patch_sha256": "<digest>", "layer_results": {"<layer>": {<layer result>}}}}
}
```

`meta.base` is the production revision the mutants were applied to, `patch_sha256` each mutant's patch digest, and `layer_roles` is optional. A layer result holds the same lists as an entry, `killed_by`, `unconfirmed_by`, `errored`, `ran` and the symptom fields, and these fields about what was run:

| Field      | Meaning                                                                                                   |
| ---------- | --------------------------------------------------------------------------------------------------------- |
| `base`     | the production revision the mutant was applied to for this layer, default `meta.base`                     |
| `tests_rev` | the revision of the tests that ran, or a digest of the test patch                                        |
| `runner`   | `{"workflow": ..., "lockfile_sha256": ...}`, what ran them                                                |
| `scope`    | `full` when the layer ran every test it could, `selected` when it ran a selection. A missing scope means full |
| `selected` | the tests chosen to run. One that isn't in `ran` is "not run", never a miss                              |
| `excluded` | `[{"test": ..., "reason": ...}]`, the tests left out on a static reading, never a miss. `test` can be any string, such as `*` for every test |

`meta.layer_roles` gives every layer other than `tsc` and `contract` a role, and `kills.py` refuses a file where a layer has none or an unknown one:

- **`removed`:** the candidates' results count, as the removed side. Other tests' results here don't count.
- **`remaining`:** every other test's results count, as the remaining side. Candidates' results here don't count.
- **`reference`:** nothing counts. It's there for a reader.

So a kept test that ran at the base and at the head counts only through its head result. The checkers' kills count as remaining, as always. Without `layer_roles`, the entry's own lists count, a candidate's results as removed and every other test's as remaining, as in the flat format. The ledger reads only files without layer roles.

#### Execution states and the remaining side

Each test's result on a mutant has one execution state: `killed`, `symptom kill`, `unconfirmed`, `unconfirmed symptom kill`, `errored`, `missed`, or `not run` for a selected test that isn't in `ran`. Only `missed` is a miss.

The remaining side's result on a mutant is one of these:

- **`killed`:** a remaining test or a checker has a confirmed kill.
- **`missed`:** at least one remaining test missed it and none killed it. The tests that errored, were unconfirmed or weren't run are still listed.
- **`unresolved`:** remaining tests ran it, but each one errored or was unconfirmed.
- **`statically excluded`:** no remaining test ran it, and a remaining layer excluded tests.
- **`unmeasured at the head`:** no remaining test ran it.

Over a [candidates file](#a-pull-requests-kills-file), a kill in any remaining layer or by a checker still makes the result `killed`. Every other result comes from the remaining layers named `*_head` alone, the same name rule the [provenance](#provenance) check uses to compare a layer with `head`. The provenance check holds the other remaining layers to the removed-at revision, so a mutant that only they missed is `unmeasured at the head`. A kills file without layer roles has no `*_head` layer, so over a candidates file its mutants are `killed` or `unmeasured at the head`.

Its scope comes from the remaining layers with a result for the mutant, and over a candidates file from the `*_head` ones among them. It's `selected` when any of them has a selected scope, `full` otherwise, and none when there are none. A mutant's `states` are among four a report prints: `caught by a removed test`, `missed by the selected remaining tests`, `statically excluded` and `unmeasured at the head`.

Its `text` is the result in words. A kill or a miss names the layers it came from, with the number of tests in each, as in "missed by 243 selected remaining tests (e2e_head 237, jest_head 6)". In a kills file without layer roles, each test counts under its kind, `e2e`, `jest` or `deftest`, and a checker's kill counts under `tsc` or `contract`. The number of tests that errored, were unconfirmed, were selected but not run, or were excluded follows. Over a candidates file, an unresolved or unmeasured result says "at the head", and the text ends with the misses in each other remaining layer, as in "not run by any remaining test at the head, 12 missed in jest_base".

Only the run's e2e tests get a verdict. Every other id, including jest and Clojure tests, counts as a remaining test, and so do the type checker and the contract checker, which run on every PR. A test's kill of a mutant a checker also kills is never unique, and the cover never keeps a test for it:

- **keep:** the test has a kill no other test has, or the kills-first cover keeps it for kills it shares only with other tests of the run.
- **provisional-keep:** not a keep, but the test has an unconfirmed kill no other test has, or the kills-first cover keeps it for unconfirmed kills it shares only with other tests of the run. For every mutant that only tests of the run kill, the cover keeps one test in its `killed_by`, or one in its `unconfirmed_by` when `killed_by` is empty, so an unconfirmed kill blocks a delete but never makes a keep.
- **delete:** no unique kill, at least `--min-mutants` qualifying mutants, every `--require-strata` stratum among them, and the baseline check passed. A qualifying mutant sits in the test's reached code, the test ran against it without erroring, and at least one other test ran against it too. The baseline check passes with a confirmed kill among the qualifying mutants, or a run against a baseline mutant without erroring, because only a baseline mutant run shows whether a test that kills nothing it reaches still guards boot. A test that fails it is unmeasured, with the reason "needs a baseline check". A delete's reason is "no unique kill among <n> qualifying mutants", followed by ", remaining scope selected" when its `scope` is `selected`, which happens only when the [joint check](#depends-on-and-the-joint-check) fails.
- **unmeasured:** anything else, including a test missing from the kills file, a mutant whose `ran` is unknown, and a test that failed in the capture.
- **eligible-for-risk-acceptance:** an unmeasured test that a person may choose to delete on a stated risk, never a measured delete. Only `kills.py` gives it, and only with a location prior.
- **accepted:** an eligible test whose acceptance a person has recorded, with who authorised it, when, and the policy scope. The script never decides it. See [Eligible for risk acceptance](#eligible-for-risk-acceptance).

A delete or unmeasured test that killed none of its qualifying mutants, with extreme mutants among them, has a reason ending in "no kill among the sampled extreme mutants", or "no kill among the sampled extreme and baseline mutants" when it also ran baseline mutants and killed none of them. The reading says nothing about the test's original regression or finer mutants, which are still planted and run.

A keep rests on its unique kills and the confirmed kills the cover keeps it for, and a provisional-keep on its unconfirmed unique kills and the unconfirmed kills the cover keeps it for. When all of them are the test's symptom kills, its `symptom_only` is true and its reason gains ", all symptom kills", as in "unique kills, all symptom kills".

Those mutants are the ones no remaining test kills, and that claim holds only at the scope that ran. A keep's `scope` is the widest scope at which the remaining side missed any of them: `full`, `selected`, or `unmeasured` when the remaining side missed none of them, because it errored, was unconfirmed, was excluded or never ran. When the scope isn't full, the reason ends in "; " and the remaining side's result on each of the mutants, as in "unique kills; reg-1: missed by 7 selected remaining tests (e2e_head 7), 42 excluded". A keep stays a keep at any scope, since keeping is the safe side. A delete, eligible, accepted or unmeasured test's `scope` is the same scope over its lost kills, the mutants in its `depends_on` that no kept test kills.

When tests share a kill, the kills-first cover prefers one that kills with an assertion, because a timeout or retry change can lose a symptom kill. Among tests with the same number of new kills, it takes the one with the most new kills that aren't its symptom kills, confirmed or not, before it looks at code, checks or time. When it drops tests whose kills the other kept tests already have, it tries the most expensive first, and among equal costs, the ones with the most symptom kills.

A kept test is one with a keep or provisional-keep verdict. Every delete, eligible, accepted or unmeasured test also gets `depends_on`: each mutant it killed that no remaining test kills, grouped by stratum, with the kept tests that kill it. The cover keeps one of them for each such mutant, so the test is safe to delete only while they stay. See [Depends on and the joint check](#depends-on-and-the-joint-check).

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

A test **reaches** a location when its chosen attempt ran any of those functions or classes. It **reaches and asserts** when a later passing assertion exists in the same test. `assertsAfter` counts the passing assertions from the first step cut that held the location, including the assertion that triggered that cut. With a schema 2 capture's [merged backend dumps](#schema-2-captures), every cut of the span holds the dump's classes, so they count from its first cut. Assertions in `after` hooks don't count.

Each test contributes one attempt: the last passing attempt of the main run, else a passing attempt of a rerun, else its last attempt. Tests with no passing attempt are left out of the results and listed separately.

### Basis

Every reach result has a `basis`:

- **`subtraction`:** measured reach, as above.
- **`baseline`:** inferred reach, through code that subtraction removes from every test. That's a frontend function that fired in every shard's baseline, and every backend baseline class, because the backend baseline is the union of the shards'. Every test that loaded the app in the top window reaches such a frontend function, and every test that made an app request reaches such a backend class. `assertsAfter` counts from the first step cut after the app loaded, or after the first app request for a backend class.

A frontend function that fired in only some shards' baselines is subtracted from those shards' tests only, so its reach stays measured.

How a test counts as having loaded the app depends on the index:

- **Built with the per-test fields in [Index files](#index-files):** it loaded the app when its top window fired any frontend function, and made an app request when its backend dump holds any class, both before subtraction. Its assertions count from the first step cut holding such a function or class.
- **Built without them:** it loaded the app when it reached a frontend function after subtraction, and made an app request when it also reached a backend class, or loaded the app, whose boot fetches the session properties. Its assertions count from the first step cut holding a frontend function it reached after subtraction, or any key it reached for a backend class. That cut comes at or after the first page load, so the count can be low. In the index of run 36089233978, it's all of the test's assertions for 4,781 of the 4,896 passing tests that loaded the app, and 219 assertions short across the other 115.

A test whose step cuts hold none of those counts all its assertions.

Baseline reach is an inference, and it's loose in both directions:

- The baseline spec signs in as an admin and opens the home page, so its code includes the navigation bar and the home page. A test that only opens a public or embedded page still counts as reaching them.
- A test with no frontend coverage, like one that runs the app inside an iframe in a schema 1 or 2 capture, never reaches baseline frontend code. For those tests the answer is unknown, not "doesn't reach".

A test that reaches a location both ways, through a measured key and a baseline key, keeps its measured row in `reach` and `reach_and_assert`, and is listed under both bases.

Each baseline reach also has a `load`, the kind of top-window page the test loaded: `app` when any of them is an app page, else `embed` (`/embed/...`), `public` (`/public/...`) or `other` (`/api/...`, `/app/...` and other paths the server answers without the app). It's `unknown` when the index records no pages, as the index of run 36089233978 doesn't, or when the test loaded no page of its own. Baseline code mixes the app shell, which only app pages run, with code every entry point runs, like the theme providers and the settings, and the baseline can't tell them apart. So reach from a load other than `app` is the least certain. A consumer such as the D7 rule can count only `load: "app"`, or only measured reach.

### Options

| Option                  | Meaning                                                                    |
| ----------------------- | -------------------------------------------------------------------------- |
| `--index <dir>`         | the index, or `JOURNEY_LOOKUP_INDEX`                                       |
| `--repo <path>`         | the git repo for source reads, default the one this folder is in           |
| `--sha <commit>`        | read source at this commit instead of the captured one                     |
| `--exclude <file>`      | test ids to leave out, one per line                                        |
| `--union`               | one result for all locations together, instead of one per location        |
| `--json`                | one JSON line per result: `reach`, `reach_and_assert`, `asserts_after`, `not_passing`, the resolved `locations` and each test's `basis`. When the location resolves to a baseline key, it adds `by_basis`, the `reach`, `reach_and_assert` and `asserts_after` of each basis, and each baseline reach's `load` |
| `--include-not-passing` | count tests with no passing attempt                                        |

The text output ends the line of a test reached with basis `baseline` with `(baseline, <load> load)`, and that of a measured test also reached that way with `(also baseline, <assertsAfter>, <load> load)`. For a location with a baseline key, it adds a line with the counts of each basis, and the baseline reach by load.

### Verdicts from a kills file

`pipeline/kills.py` gives each candidate a keep, provisional-keep, delete, unmeasured, eligible-for-risk-acceptance or accepted verdict from a kills file and this index, with no pipeline run. It needs Python 3.9 or later and `node`, and reads the index through `lookup/reach.mjs`.

```
python3 e2e/coverage/journey/pipeline/kills.py --index <index dir> --kills <file> --candidates <file or test id> [--candidates ...]
    [--min-mutants <k>] [--require-strata <s,...>] [--prior <file>] [--callers <file>] [--ci-history <file>] [--accept-cap <k>]
    [--max-prior <x>] [--acceptances <file>] [--out <json file>] [--repo <path>] [--sha <commit>] [--joint-check-report-only]
    [--allow-provenance-mismatch]
```

| Option                      | Meaning                                                                                                   |
| --------------------------- | --------------------------------------------------------------------------------------------------------- |
| `--index <dir>`             | the index, or `JOURNEY_LOOKUP_INDEX`                                                                       |
| `--kills <file>`            | a [kills file](#kills-file)                                                                                |
| `--candidates <file or id>` | the tests proposed for deletion. A file holds one test id per line, a JSON list, or JSON lines with a `deleted_test` or `id` field. Anything else is read as one test id. Repeat it for more. A [candidates file](#a-pull-requests-kills-file) must be the only one |
| `--min-mutants <k>`         | qualifying mutants a delete verdict needs, default 5                                                       |
| `--require-strata`          | coarse strata a delete verdict needs among them, default `logic,wiring`                                    |
| `--prior <file>`            | the location prior, which an eligible verdict needs. See [Eligible for risk acceptance](#eligible-for-risk-acceptance) |
| `--callers <file>`          | the files of each candidate's direct callers, keyed by test id. The prior then covers them too. See [Eligible for risk acceptance](#eligible-for-risk-acceptance) |
| `--ci-history <file>`       | CI failure history keyed by test id, at the top level or under `tests`. Each candidate's entry is recorded on its eligibility and never decides it |
| `--accept-cap <k>`          | eligible verdicts one module can take, default 2                                                           |
| `--max-prior <x>`           | the highest prior an eligible verdict can have, default 0.5                                                |
| `--acceptances <file>`      | who authorised each accepted test, when, and under what policy scope, keyed by test id. See [Eligible for risk acceptance](#eligible-for-risk-acceptance) |
| `--out <file>`              | where to write the full result as JSON                                                                     |
| `--repo`, `--sha`           | as for `lookup.mjs`                                                                                        |
| `--joint-check-report-only` | report a failed [joint check](#depends-on-and-the-joint-check) without exiting with code 1                |
| `--allow-provenance-mismatch` | give verdicts when the kills file's revisions don't match, with every output stamped. See [Provenance](#provenance) |

The verdict rules are the pipeline's, and run through the same code. What differs:

- **Candidates:** only the tests given with `--candidates` get a verdict. Every other id in the kills file is a remaining test, including e2e tests that aren't candidates. A candidate that isn't in the index is still a candidate, and it's unmeasured unless it has a unique kill, confirmed or not.
- **Reach:** a mutant's location is its `locations` list, its `location`, or its own `file`, `fn`, `line`, `column`, `ns` and `var`, in any form from [Locations](#locations). A candidate reaches the mutant when it ran a function or class the location resolves to, so reach is per function where the pipeline's is per file. A `file` with nothing else means the whole file, as in the pipeline. No candidate reaches a location that resolves to nothing.
- **Basis:** reach of either [basis](#basis) counts, and each candidate's `qualifying_basis` lists its located qualifying mutants under the basis of its reach, so a verdict that rests on inferred reach shows it. The pipeline's reach is always `subtraction`.
- **No location:** a mutant without one counts as reached by every candidate that ran against it, as in the pipeline, and the output marks it: under `reach` for the mutant, and in `qualifying_without_location` for each candidate.
- **Repeated titles:** a candidate id without a suffix stands for every index test with its spec and title. It reaches what any of them reached, and it passed in the capture when all of them passed. `ordinals` in the output lists the candidates that stand for more than one test, with their index ids.
- **Cover:** the index has no durations or assertion text, so when the kills-first cover chooses between candidates that share kills, it breaks ties on the kills that aren't symptom kills, then on reached code, then on the order of `--candidates`.

#### A pull request's kills file

There's no index at a PR's head, so `kills.py` also takes a candidates file, a JSON object, in place of the index:

```
python3 e2e/coverage/journey/pipeline/kills.py --kills <file> --candidates <candidates file> [options] --out <json file>
```

```
{"removed_at": "<commit>", "head": "<commit>", "tests": ["<test id>", ...]}
```

`removed_at` is the revision the tests were removed at and `head` the PR's head, which is optional. The tests are the candidates. `kills.py` then reads no index, even when `--index` or `JOURNEY_LOOKUP_INDEX` is set, and a candidate reaches every mutant it ran, with basis `ran`. There's no capture, so no candidate is unmeasured for not being in it or failing in it. The verdict rules are otherwise the same, including the minimum sample and the required strata before a delete. A PR's kills file is usually [format 2 with layer roles](#format-2-and-layer-roles), and only its `*_head` layers can find a mutant missed, as [Execution states and the remaining side](#execution-states-and-the-remaining-side) says.

It prints a short report, with the joint check on its first line, after any provenance banner, and the verdicts eligible for risk acceptance in a section of their own. With `--out`, it also writes JSON with these keys:

- `joint_check`: `ok`, or the mutants that fail it, below
- `provenance`: what the observations rest on and how they were checked, [below](#provenance)
- `mode`: `index` or `candidates file`, with `index` or `candidates_file` saying which, and the other one null
- `candidates`: for each candidate, the verdict and reason, its `scope`, `unique_kills`, `unconfirmed_unique_kills`, `cover_kept_for` (the mutants the kills-first cover keeps it for), `symptom_kills` and `unconfirmed_symptom_kills` (its kills and unconfirmed kills that are symptom kills) and `qualifying_mutants` by stratum, `qualifying_without_location`, `qualifying_basis`, the number of `kills` and `misses`, the mutants it `errored` on, `symptom_only`, `equivalent_suspects`, the suspected equivalent mutants it would otherwise sample, with how each stands, and `also_killed_by_checker`, its kills that a checker also makes, as `{"<stratum>": {"<mutant id>": ["type checker" | "contract checker", ...]}}`. A delete, eligible, accepted or unmeasured candidate also has `depends_on` and `symptom_only_after_deletion`, below, an unmeasured, eligible or accepted candidate has an `eligibility`, below, and an accepted one has `accepted`, its `authorisation` and `policy_scope`
- `risk_acceptance`: the eligible and accepted verdicts on their own, below
- `summary`: verdicts, reasons, `scopes` (the candidates with each scope, by verdict), candidates per stratum, and under `symptom_kills` the candidates' kills, how many of them are symptom kills, their unconfirmed symptom kills, and how many keeps and provisional-keeps rest only on symptom kills
- `mutants`: for each mutant, its stratum, how its reach was decided, what each location resolved to with its number of `baseline_keys`, how many candidates reach it, and:
  - `removed`: the removed side's `result`, `caught`, `missed`, `unresolved` or `not run`, and `tests`, each candidate with a result and its execution state
  - `remaining`: the remaining side's `result` and `scope`, as [above](#execution-states-and-the-remaining-side), `text`, the result in words, `killed_by`, `missed` (a count), `missed_by` (the tests, when the scope is selected), `errored`, `unconfirmed_by`, `not_run`, `excluded`, and `layers`, each remaining layer's role, scope and number of tests in each execution state. Over a candidates file, the tests in each list other than `killed_by` come from the `*_head` layers, and `layers` has every remaining layer
  - `states`: its states among the four
  - `patch_sha256` and `provenance`, in a format 2 file: the patch digest, and each layer result's `base`, `tests_rev` and `runner`
  - `equivalent_suspect`, for a suspected equivalent mutant: its `state` (`unresolved`, `reviewed equivalence`, `scope decision`, `not equivalent` or `killed`), `record` (which of the three it carries), `resolution` (that record, with a short record's `by` as `approved_by`), `incomplete`, `resolution_stale`, `resolution_rev_differs`, a scope decision's `limits` and `note`, `deletion_depends_on_dismissing` and `candidates`, below
- `mutant_states`: how many mutants are in each of the four states, how many a removed test caught and no remaining test killed, and how many have each result on each side
- `kills_cover`: the candidates the cover keeps
- `kills`: the kills file's `format` and `layer_roles`, counts by stratum and by reach, the kills file's e2e ids that aren't in the index, and under `symptom_kills` the file's kills and unconfirmed kills, how many of each are symptom kills, the mutants that rest only on symptom kills, and the ignored symptom ids, `checker_kills` with the number of mutants each checker kills, `checker_disagreements` with the mutants whose `killed_at_layer` and `layer_results` disagree on a checker kill, `results_on_the_other_side` with the results that don't count because of their layer's role, `equivalent_suspects` with the suspected equivalent mutants by how they stand, and `equivalence_record_problems`, each record that resolves nothing and why
- `candidates_not_in_index` and `ordinals`, over the index only

The report also counts the mutants in each state, and lists each mutant a removed test caught and no remaining test killed, with the remaining side's result in words and the candidates that caught it.

#### Provenance

Before it gives any verdict, `kills.py` checks the revisions a format 2 kills file records against what it reads the file with:

- **Over the index:** each layer result's production revision, its `base` or `meta.base`, must be the index's app commit, `meta.json`'s `appBase`, or its captured commit, `sha`. An e2e layer's `tests_rev`, from `e2e` or any layer named `e2e_*`, must be one of the two as well, since the index's reach comes from the tests at the captured commit.
- **Over a candidates file:** a `*_head` layer's base must be the file's `head`, and is left unchecked when the file names none. Every other layer's base must be `removed_at`. So one mutant's `e2e_base` and `e2e_head` results can sit on different revisions and both match.

Commits match when one is a prefix of the other and both have at least 7 characters. A mismatch stops `kills.py` with exit code 2 and says what differs. `--allow-provenance-mismatch` gives the verdicts anyway, and stamps every output: `provenance.status` is `mismatch` with `overridden` true, and the report's first line is a banner naming each mismatch. A revision the file doesn't record is unknown, never a match: it's stamped the same way, with a banner starting "Provenance unknown", and doesn't need the flag.

A flat kills file records no revisions, so it reads without the flag, with `provenance.status` `unknown` and "Base unknown: the kills file is in the flat format, which records no revisions" as the report's first line.

The `provenance` block has `status` (`match`, `unknown` or `mismatch`), `overridden`, `banner`, `kills` (the file, its sha256, its format and `meta.base`, `emitted_at` and `emitter`), `against` (the index's commits or the candidates file's), `checks` (each check by layer and revision found, with the revisions expected, the number of mutants and the result), `mismatches`, `unknown`, `runners` (each layer's workflows and lockfile digests) and `mutants_without_patch_sha256`.

#### Suspected equivalent mutants

A mutant with `equivalent_suspect: true` and no confirmed kill earns no sample credit: it isn't a qualifying mutant, so it counts towards neither `--min-mutants` nor `--require-strata`, and it can leave a candidate under the minimum and unmeasured. Each candidate's `equivalent_suspects` lists the ones it would otherwise have sampled.

Until a record resolves it, it's unresolved, and it counts as a survivor that blocks eligibility for risk acceptance. It doesn't stop a delete that the other mutants already justify, since a delete never needs every sampled mutant killed. A mutant carries at most one of three records:

- **`equivalence`:** the mutant was reviewed and is equivalent. It's resolved: still no sample credit, and no longer a blocker.
- **`scope_decision`:** the mutant is out of scope. It's resolved the same way, but only for the functional comparison, and its `limits` travel into the outputs with it. A scope decision never means a performance guard can be deleted, and the outputs say so.
- **`not_equivalent`:** the suspicion was reviewed and rejected, so the mutant is an ordinary one everywhere, as if it weren't marked.

A record resolves the mutant only when it has `approved_by`, `date`, `reason`, `reviewed_sha` (except `not_equivalent`) and `patch_sha256`, and that `patch_sha256` is the mutant's own, the digest of its current patch:

- A record for another digest is stale, with `resolution_stale` true, and the mutant is unresolved.
- A record missing a field is incomplete, with `incomplete` true, and the mutant is unresolved. That includes the short forms `equivalence: {reviewed_by, date, reason}` and `scope_decision: {by, date, reason}`, whose `by` is read as `approved_by`. They're shown, not dropped.
- A `reviewed_sha` other than the kills file's `meta.base` only sets `resolution_rev_differs`, as information.
- Two or more records resolve nothing.

`reviewed_by` is whoever did the analysis and `approved_by` whoever approved it. The outputs keep them apart, and never show an approval as the analysis.

For each unresolved suspect in a sample, `deletion_depends_on_dismissing` says whether dismissing that one mutant, and only it, changes any candidate's verdict, and `candidates` lists them. When two suspects block the same candidate, dismissing either one alone changes nothing, so neither is flagged. That errs towards keeping the test, and it's kept that way on purpose.

A suspected equivalent mutant with a confirmed kill shows the mark is wrong, and it counts as any killed mutant does.

#### Depends on and the joint check

The candidates are judged together: what stays is every remaining test plus the kept candidates, those with a keep or provisional-keep verdict. Unmeasured candidates don't count as staying.

A delete, eligible, accepted or unmeasured candidate's `depends_on` lists each mutant it killed that no remaining test kills, grouped by stratum, with the kept candidates that kill it:

```
{"<stratum>": {"<mutant id>": ["<kept candidate id>", ...]}}
```

The kills-first cover keeps a candidate for each of those mutants, so the list is empty only when none of their killers passed in the capture. The report has a section, `Kills that no remaining test has`, with a line for each candidate whose `depends_on` isn't empty: "safe only while <kept candidates> stay", with the mutants by stratum, and a second line for any mutant that no kept candidate kills.

`symptom_only_after_deletion` lists, by stratum, each mutant the candidate killed that the remaining tests and kept candidates kill only through symptom kills. Symptom kills count, so they don't block a delete, but each one rests on a timeout or a refused click. The report lists them in a section, `Kills that stay only as symptom kills`.

The report also has a `Symptom kills` section when the kills file has any, with the counts from `kills` and `summary`. When a checker kills any mutant, the report gives the counts under the mutants, and a section, `Kills a checker also makes`, lists each candidate with one, as in "delete, the type checker also kills logic reg-55322". Each keep, provisional-keep and delete it lists has a line for its symptom kills and one for its unconfirmed symptom kills, and the reasons of the candidates that rest only on symptom kills end in ", all symptom kills".

The joint check takes the delete, eligible and accepted candidates together, and fails when one of them killed a mutant that no remaining test and no kept candidate kills. The verdict rules never allow that, so a failure is a bug in them. `joint_check` is then, by stratum, each such mutant with the delete, eligible and accepted candidates that kill it, in the same shape as `depends_on`. The report lists them at the top, and the command exits with code 1 after writing its output, unless `--joint-check-report-only` is given.

#### Eligible for risk acceptance

A verdict of eligible for risk acceptance, `eligible-for-risk-acceptance`, marks an unmeasured test that a person may choose to delete on a stated risk. It's never a measured delete, which is why the report and the JSON keep it apart from the other verdicts. `kills.py` never decides to accept it: a test is `accepted` only when the `--acceptances` file records who authorised it, when, and the policy scope it was accepted under.

An unmeasured candidate that passed in the capture becomes eligible when it has all three fields:

| Field     | Meaning                                                                                                   |
| --------- | --------------------------------------------------------------------------------------------------------- |
| `prior`   | the highest `score` the location prior gives the files of its qualifying mutants' locations, and the files of their direct callers when `--callers` is given. The index resolves each location to its file |
| `sampled` | n, the number of its qualifying mutants, which must be at least 4. It's a count of what was observed, and the verdict reads nothing more into it |
| `module`  | the location prior's module for each file of its qualifying mutants' locations. The index has no modules, so they come from the prior |

It also needs:

- a prior of at most `--max-prior`, default 0.5, which is no file above the median when the score is a percentile.
- a confirmed kill on every one of its n qualifying mutants by a test that stays: a remaining test, which isn't a candidate, or a kept candidate. A sampled mutant that none of them kills is a survivor, with the outcome `survivor in sample`.
- the baseline check, as for delete.

Each module takes at most `--accept-cap` eligible verdicts, default 2, accepted ones included, so one wrong prior takes at most two tests out of a module before an escape there brings them back. Candidates are taken lowest prior first, then the most sampled mutants, then in `--candidates` order. A candidate whose files span several modules counts against each of them.

A keep or provisional-keep is never eligible, and neither is a candidate that didn't pass in the capture.

The acceptances file is JSON keyed by test id:

```
{"<test id>": {"authorisation": {"by": "<person>", "date": "<date>"}, "policy_scope": "<the policy it was accepted under>"}}
```

An eligible candidate with a record that has all three fields is `accepted`, and its row has them under `accepted`. A record missing a field leaves the candidate eligible. A record for a test that isn't eligible, or isn't a candidate, accepts nothing, so the cap and every other condition still hold. Each such record is listed in `risk_acceptance.data_warnings` and at the end of the report's section.

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

Each eligibility's `prior_over` says what the prior covers: `reached files`, or `reached files plus direct callers` with `--callers`. Modules come from the reached files alone.

**Static importers:** when the location prior has a graph file beside it, named `<prior name>-graph.json`, each eligibility records the static importers of its reached files. That's the files that import them and, through a barrel, the files that import the barrel. They're information only and never change the prior, because importing a file isn't calling the function that changed. The record is a summary, since one file can have hundreds of importers: `role` (`information only`), `count`, `unscored` (how many the prior has no score for), the highest score as `max`, and the 10 highest-scored importers in `highest`.

```
{"barrels": ["<path>", ...], "importers": {"<path>": ["<importing path>", ...]}}
```

**Direct callers:** with `--callers`, the prior also covers the files of the direct callers of the functions a candidate's qualifying mutants sit in. The file is JSON keyed by test id, and nothing produces it yet:

```
{"<test id>": ["<caller path>", ...]}
```

The prior's `callers` holds their scores. A candidate without an entry has no prior, and one with an empty list has no direct callers.

Every unmeasured, eligible or accepted candidate's `eligibility` has the three fields, `prior_over`, `importers` when the prior has a graph file, `missing` with each missing field and why, the `survivors` in its sample, an `outcome`, and its `ci_history` entry when `--ci-history` is given. The `outcome` is one of `eligible`, `missing fields`, `never: did not pass in the capture`, `survivor in sample`, `unresolved suspected equivalent mutant in sample`, `needs a baseline check`, `prior above the maximum` or `over the module cap`.

The top-level `risk_acceptance` key has:

- the settings: `cap`, `max_prior`, `min_sampled`, the `prior` file with its `base_commit`, what it covers, the `callers` file, the `graph` file and the `importers` role, the `ci_history` file and the `acceptances` file
- `eligible`: each eligible or accepted candidate with its `eligibility`
- `accepted`: each accepted candidate with its `authorisation` and `policy_scope`
- `modules`: for each module that made a candidate eligible or turned one away at the cap, those candidates and the rollup's `prior`
- `outcomes`: the number of unmeasured, eligible and accepted candidates with each outcome
- `missing`: among the candidates with `missing fields`, the number missing each field
- `data_warnings`: each acceptance record that accepts nothing, and why

The tests run a synthetic kills file through both this command and the pipeline's verdicts, and a synthetic location prior through the eligible and accepted verdicts. They also build a [location ledger](#location-ledger) from a synthetic kills file and check it with `ledger-verdicts.mjs`. They need the index of run 36089233978 or 36482017221. One more test runs the stranded culls through the joint check, from the corpus kills file, `reach-counts.jsonl` and the location prior under `local/`, or under `JOURNEY_LOCAL_DIR`, and it skips without them:

```
JOURNEY_LOOKUP_INDEX=<index dir> [JOURNEY_LOCAL_DIR=<local dir>] python3 e2e/coverage/journey/pipeline/test_kills.py
```

### Location ledger

```
node e2e/coverage/journey/lookup/ledger.mjs --index <index dir> --kills <file> --out <dir>
    [--locations <reach-counts.jsonl>] [--candidates <file or test id> ...] [--mutants-dir <dir>] [--allow-provenance-mismatch] [--repo <path>]
```

`ledger.mjs` joins the index and a [kills file](#kills-file) into one row per code location. A row is a frontend function with its own Istanbul counter, `{file, fn}`, or a backend top-level form, `{ns, var}`. Mutant locations and `--locations` resolve as in [Locations](#locations), and the ones that resolve to the same function or form share a row. Each row holds the tests that reach it and assert afterwards, the mutants planted there, their confirmed killers per layer, and each mutant's `cheapest_layer`: the first of `tsc`, `contract`, `jest`, `deftest` and `e2e` with a confirmed kill, or `none`. Reach counts only tests that passed in the capture. It reads the flat format and format 2 without layer roles, and exits with code 1 on a file with them, which is a PR's file for `kills.py --candidates`.

Reach is split by [basis](#basis): the `_measured` fields and columns hold reach with basis `subtraction`, and the `_baseline` ones reach with basis `baseline`. A test that reaches a row both ways is in both. Each baseline pair has the test's [load](#basis) as a third element, and the counts and the CSV split the baseline reach by load. The demand list and the e2e floor come from the kills alone, so the basis never changes them.

| Option                      | Meaning                                                                                                   |
| --------------------------- | --------------------------------------------------------------------------------------------------------- |
| `--index <dir>`             | the index, or `JOURNEY_LOOKUP_INDEX`                                                                       |
| `--kills <file>`            | a [kills file](#kills-file). A mutant without a location sits in no row                                    |
| `--out <dir>`               | where the outputs go                                                                                       |
| `--locations <file>`        | `reach-counts.jsonl`. Each line's `locations` get rows, which record the line's `issue`                   |
| `--candidates <file or id>` | the tests proposed for deletion, in any form `kills.py` takes. Repeat it for more. The CSV's `e2e_reach_*` and `e2e_reach_and_assert_*` columns leave them out |
| `--mutants-dir <dir>`       | per-mutant `<mutant id>.json` files, whose `description` goes into the CSV, and `unit-results.json`, where a mutant's `typecheck` of `fails` is a kill at the `tsc` layer |
| `--allow-provenance-mismatch` | join even when the kills file's revisions don't match the index, below                                 |
| `--repo <path>`             | the git repo for source reads and commits, default the one this folder is in                               |

**Provenance:** the ledger checks the kills file's revisions against the index as `kills.py` does, in [Provenance](#provenance). When a production revision is the app commit rather than the captured commit, rows in files the capture branch changes are marked `mixed`, and when those files can't be listed because a commit is missing from the repo, that's a mismatch. On a mismatch it refuses to join, with exit code 2. `--allow-provenance-mismatch` joins anyway, marks every row `mismatch` and puts a banner on the first line of `summary.md`. A flat kills file joins with every row marked `unknown` and a first line saying the base is unknown.

**Cheapest layer:** when a mutant's entry has `kill_confirmed`, its `cheapest_layer` is its `killed_at_layer` if `kill_confirmed` is true, and `none` if it's false. A contract kill has no test id, so `killed_at_layer` is the only place the kills file records it. An entry without `kill_confirmed`, from an older kills file, gets its cheapest layer recomputed: the first layer with a confirmed killer, where `killed_by` gives the test layers, a `typecheck` of `fails` is a `tsc` kill, the failed checks in `layer_results.contract` are `contract` killers, and a checker kill read as `kills.py` reads it is a kill at that checker's layer. The recomputation runs for every mutant. Where it disagrees with the kills file's layer, the kills file's layer is used, the mutant keeps the recomputed one as `recomputed_layer`, and the summary lists it. Each mutant's `cheapest_layer_source` is `killed_at_layer` or `recomputed`. A `kill_confirmed` of true with a `killed_at_layer` that isn't one of the five layers stops the ledger with an error.

It writes three files to `--out`:

- `ledger.json`: every row, with its reaching tests as `[test index, assertsAfter]` pairs in `reach_and_assert_measured`, `reach_other_measured`, `reach_and_assert_baseline` and `reach_other_baseline`, their counts, the index keys each candidate reached, for the kills-first cover's tie-break, and a status (`no mutants`, `all killed`, `some killed` or `none killed`), every mutant with its killers, its symptom kills by layer in `symptom_kills` and `symptom_unconfirmed_by`, `symptom_only`, `checker_kills` read as `kills.py` reads them and `checker_disagreement` when its two records disagree, `e2e_status`, `cheapest_layer_source`, `equivalent_suspect` when the kills file sets it and no `not_equivalent` record resolves it, `equivalence_state` with the `equivalence` block (the record, the resolution, `incomplete`, `resolution_stale` and `resolution_rev_differs`) and `equivalence_problems`, the number of tests in each execution state by layer in `test_states`, each e2e test's state in `e2e_states`, and the `scope` and `excluded` tests of its layer results, its `patch_sha256`, the `provenance` block as `kills.py` writes it with `changed_between` (the files the capture branch changes) and `mixed_rows`, the inputs, the mutants where `killed_at_layer` disagrees with the recomputed layer, the demand list, the suspected equivalent mutants and the e2e floor.
- `ledger.csv`: one line per row and mutant, or one line for a row without mutants. `e2e_reach_measured`, `e2e_reach_and_assert_measured`, `e2e_reach_baseline`, `e2e_reach_and_assert_baseline` and `e2e_reach_and_assert_baseline_by_load` leave out the candidates, and the `_total` columns keep them. `contract` is the contract checker's result from `layer_results`, `not run` when `layers_run` leaves it out, and empty in an older kills file. `symptom_kills_layers` and `symptom_unconfirmed_by_layers` count the mutant's symptom kills by layer, and `symptom_only` is `yes`, `no`, or empty for a mutant with no kill. `equivalent_suspect` is `yes` for a mutant the kills file marks, `no` for any other mutant, and empty on a row without mutants. `checker_kills` names the checkers that kill it, `equivalence_state` says how a suspected equivalent mutant stands, and `patch_sha256` is the mutant's patch digest. `base` is `match`, `mixed`, `unknown` or `mismatch`.
- `summary.md`, also printed: the counts, including the rows with baseline reach, where the kills file's own `cheapest_layer` differs from the derived one, where `killed_at_layer` disagrees with the recomputed layer, the checker kills and any disagreement between their two records, the symptom kills and any ignored symptom ids, the demand list, the suspected equivalent mutants when there are any, and the e2e floor.

The **demand list** is the mutants with `cheapest_layer: none` that the kills file doesn't mark `equivalent_suspect`, grouped by stratum with their rows. The **e2e floor** is the mutants whose cheapest confirmed layer is e2e. Both read the same `cheapest_layer`, so a mutant with `kill_confirmed` true is never on the demand list, even when its `killed_by` is empty. The JSON also has the floor with unconfirmed e2e kills counted, and the mutants the kills file routes to e2e, which is a judgement and not a kill.

A symptom kill is a kill here too, so a mutant whose only confirmed kill is a symptom kill is on the e2e floor and off the demand list. A mutant rests only on symptom kills when its confirmed kills at every layer, or its unconfirmed kills when it has none, are all symptom kills, and its `symptom_only` is then true. Each group of the demand list and the e2e floor in the JSON lists those mutants in `symptom_only`, the demand table has a column for them, and the summary gives their count under the demand list and under each e2e floor line. On the demand list they are the mutants whose only kill is an unconfirmed symptom kill, and on the floor they are the mutants whose only kills a timeout or retry change could lose.

No test can kill an equivalent mutant, so a mutant with `equivalent_suspect: true` and no confirmed killer is left out of the demand list and its counts by row, stratum and route. A marked mutant that some test kills shows the mark is wrong, so it keeps its cheapest layer and can be on the e2e floor. The JSON groups the marked mutants by stratum under `equivalent_suspect`, or under `equivalent_suspect_killed` when they have a confirmed kill. The summary counts them in a section of their own, names each killed one with its layer, and says how each unkilled one stands: unresolved, with how many have a stale or an incomplete record, resolved by a reviewed equivalence or a scope decision, or found not equivalent, which puts it back on the demand list when nothing kills it. The CSV's `equivalence_state` gives each one's. `kills.py` and `ledger-verdicts.mjs` read the mark as [Suspected equivalent mutants](#suspected-equivalent-mutants) says.

`ledger-verdicts.mjs` checks the ledger against `kills.py`:

```
node e2e/coverage/journey/lookup/ledger-verdicts.mjs --ledger <ledger.json> --verdicts <kills.py --out file> --candidates <file or test id> [--candidates ...]
    [--min-mutants <k>] [--require-strata <s,...>] [--strata coarse]
```

It recomputes each candidate's verdict from `ledger.json` by `kills.py`'s rules, including the baseline check, the symptom markers, the remaining side's scope and the sample credit of suspected equivalent mutants, and compares it with what `kills.py --out` wrote for the same kills file, index and candidates: each candidate's state and every field of its result, including `scope`, `qualifying_basis`, `equivalent_suspects`, `symptom_kills`, `symptom_only`, `symptom_only_after_deletion` and `also_killed_by_checker`, with each mutant's `checker_kills` counted as a kill by the remaining suite, the candidates the kills-first cover keeps, and how many candidates reach each mutant. It also prints the keeps and provisional-keeps that rest only on symptom kills. Reach of both bases counts, as in `kills.py`, and an older ledger's `reach_and_assert` and `reach_other` count as measured reach. The kills-first cover breaks ties on the index keys each candidate reached, as `kills.py` does, which the ledger records for its own `--candidates`, so give both commands the same ones. It prints the ledger's provenance first, and counts it as a difference when the ledger and the verdicts file read kills files with different sha256 digests. It prints the differences and exits with code 1 if there are any. It leaves out each candidate's `eligibility` and `accepted`, which depend on the location prior and the acceptances file that the ledger doesn't take, so an eligible or accepted verdict from `kills.py --prior` shows as a difference. It also leaves out `depends_on`, which comes from the other candidates' verdicts, and those are compared on their own rows. `--min-mutants` and `--require-strata` default to the verdicts file's own. `--strata coarse` compares each mutant's `stratum_coarse` instead, for verdicts made before the finer strata. The candidates must be e2e tests, because the ledger keeps only the e2e ids that ran each mutant.

### Building an index

```
node e2e/coverage/journey/lookup/build-index.mjs --run <run dir> [--rerun <run dir> ...] --out <index dir> [--app-base <commit>]
node e2e/coverage/journey/lookup/build-lines.mjs --jar <metabase.jar from journey-capture-uberjar> --index <index dir>
node e2e/coverage/journey/lookup/build-cljs-origins.mjs --maps <journey-capture-cljs dir> --index <index dir>
```

A run dir holds the run's decrypted `journey-capture-shard-*` artifacts. To start from a run id, download and decrypt them first, with `JOURNEY_AGE_IDENTITY=<identity file> e2e/coverage/journey/pipeline/fetch_journey.sh <run id> <run dir>`. `build-index.mjs` takes about a minute for a 100-shard run.

`build-index.mjs` records the app commit the capture branch sits on as `appBase` in `meta.json`, for the provenance checks of `kills.py` and the [location ledger](#location-ledger). It's `--app-base` when given, and otherwise the merge base of the captured commit and `origin/master` in the repo this folder is in. When neither gives a commit, the index has no `appBase` and the build prints a warning.

The other two steps are optional. Without `lines.json`, backend matching is by var name only, which misses `defmethod` bodies. Without `cljs-origins.json`, `.cljc` forms have no browser side. GitHub keeps the uberjar artifact for 7 days, like the others.

### Index files

| File                | Content                                                                                                       |
| ------------------- | ------------------------------------------------------------------------------------------------------------- |
| `meta.json`         | runs, captured sha and its `appBase`, counts                                                                   |
| `tests.json`        | per test: id (with ` [n]` on the nth test of a spec that repeats a title), spec, title, run, shard, attempt, state, passing assertion count, and optionally `loadedApp` and `madeRequest`, with `loadAsserts` and `requestAsserts`, the passing assertions from the first step cut after each, or null when no cut holds one, and `pages`, the paths of its top-window page loads. See [Basis](#basis) |
| `keys.json`         | the keys (`fe:<file>#<fnIndex>` or `be:<class>`) with offsets into `postings.bin`                              |
| `postings.bin`      | per key, `uint32` pairs: test index, and 1 + assertions after the first cut holding the key (0 when no cut held it) |
| `fnmap.json`        | Istanbul function names and positions per file                                                                 |
| `baseline.json`     | the subtracted backend classes, per frontend function the number of shards whose baseline fired it, and optionally `keys`, the keys subtraction removes from every test |
| `lines.json`        | per backend class: source file name, first and last line                                                       |
| `cljs-origins.json` | per browser cljs function: source path and line                                                                |

### Limits

- **Granularity:** reach is per function or class, not per line or branch. A test that calls a function without taking the changed branch still counts.
- **Iframes:** in schema 1 and 2 captures, frontend counters come from the top window only, so tests that run the app inside an iframe (interactive embedding, the SDK iframe) have no frontend coverage and never show frontend reach. Schema 3 captures also read same-origin frames.
- **Baseline:** code in every test's baseline has no measured reach, only reach inferred for every test that loaded the app or made an app request, with basis `baseline`. See [Basis](#basis).
- **Background jobs:** backend code from background jobs lands in whichever test was running.
- **Assertions:** an assertion counts whether or not it checks anything the location affects.
