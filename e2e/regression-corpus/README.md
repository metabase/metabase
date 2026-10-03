# Regression corpus

Real Metabase bugs that were fixed, each stored as a patch that puts the bug back. Reintroducing a bug and watching which tests fail shows what a test suite actually catches. That's the evidence we want before deleting a test or moving it to a cheaper layer, for example replacing an e2e repro with a unit test.

No test run reads this folder. It's data plus the scripts that built it. It lives in the monorepo because every entry is a patch against repo paths, so it has to move with the code.

## Layout

- `bugs/<issue>/record.yaml` is the entry: one bug per directory, named after the GitHub issue it was reported in.
- `bugs/INDEX.jsonl` has one line per record, with the fields you'd filter on.
- `bugs/<issue>/rebuilt/` holds a mutant rebuilt on a recent master, for entries whose original mutant stopped applying or reintroduced the wrong behaviour.
- Everything else in `bugs/<issue>/` is from the first pass over the corpus in July 2026 and is kept as it was: the original mutant (`inverse.patch`, `mutation.patch` or `reconstruction.patch`), and `witness.patch` or `hole-closer-test.patch` when a unit test was written to catch it. `record.yaml` is the file to read.
- `docs/july-study.md` describes how the first pass in July built its entries and what it found.
- `scripts/` has the scripts that built the July entries, and `mutation-witness.md`, the check July used to tell an e2e repro that misses its bug from a mutant that never reintroduced it.
- `generators/` has the scripts that plant synthetic mutants and run mutants against the unit suites.

## The record

[`bugs/25614/record.yaml`](bugs/25614/record.yaml), shortened:

```yaml
id: reg-25614
origin:
  kind: regression
  issue: 25614
  fix_commit: 13f589c08303576ec146f070ce7e67004eeef59a
  fix_tests: [...]
bug:
  statement: "On a bar or area chart stacked to 100%, the trend line doesn't show because its values aren't scaled to the 0–100% axis."
  odc: {type: Algorithm/Method, qualifier: Missing}
  module: visualizations
  lowest_level: unit
  stratum: logic
  fe_be_boundary: false
mutant:
  base_commit: "8317274709c"
  patch: rebuilt/mutant.patch
  method: reconstructed
  status: live
  retired_reason: null
hint:
  test: "frontend/src/metabase/viz-core/echarts/cartesian/model/trend-line.unit.spec.ts::getTrendLines (metabase#25614) normalizes trend values to [0, 1] for a Stack-100% chart"
  expected_failure: "expect(datum.count_trend).toBeCloseTo(0.75) -- Expected: 0.75, Received: 30"
notes: "..."
```

- `id` is `reg-<issue>` for a regression and `syn-<module>-<n>` for a synthetic mutant.
- `bug.statement` is what identifies the bug: the behaviour that goes wrong, in plain words. The patch gets rebuilt when the code moves, but the statement doesn't change.
- `origin.fix_commit` is the commit that fixed the bug, and `origin.fix_tests` lists the tests that shipped with the fix. Those tests were written against exactly this bug, so results should be reported both with and without them.
- `origin.alias_of` marks an issue fixed by the same commit as another entry. An alias has no `bug`, `mutant` or `hint`, because those live in the other entry.
- `bug.stratum` is the kind of fault, described under Strata below. `bug.lowest_level` is the cheapest level that can observe the bug: `unit`, `integration`, or `browser-measurement` when it needs a real browser's layout (`getBoundingClientRect`, scroll geometry, `ResizeObserver`). `bug.odc` is the Orthogonal Defect Classification type and qualifier, and `bug.fe_be_boundary` says whether the bug crosses the frontend/backend contract.
- `mutant.patch` is relative to the entry's directory and applies at `mutant.base_commit`. `mutant.method` is `inverse` for July's reversed fix diffs, `reconstructed` for a patch written from the fix by hand, or `generated`. An `inverse` patch is stored in the fix's direction, so it applies with `git apply -R`.
- `mutant.status` is `live` when the patch applies at `base_commit` and a test fails on it, `pending` when it applies but no test has been shown to fail on it yet, `stale` when it no longer applies or reintroduces a different behaviour from the statement and needs rebuilding, and `retired` when there's no patch or it can't be made to reproduce any more. `retired_reason` says which.
- `hint.test` is a test that fails on the mutant, and `hint.expected_failure` is the failure it gives. It's where to start when the patch needs rebuilding. It doesn't define the bug. A different test failing on the mutant, or a checker rejecting it, is just as good a kill. Jest ids are `<spec path>::<full test name>` and deftest ids are `<namespace>/<test>`.
- `notes` has provenance and caveats.

## rebuilt/

- `mutant.patch` reintroduces the bug at `8317274709c`.
- `variant-*.patch` are other ways of reintroducing the same bug. `notes.md` says what each one changes and whether the hint test fails on it, which shows how tied the hint test is to one version of the bug.
- `witness.patch`, when there is one, adds the hint test, which isn't on master. Apply it before both the clean and the mutated run.
- `notes.md` explains where the code moved since the fix, why the mutant has its shape, what the clean and mutated runs printed, and anything that could trip up the next person.

## Adding an entry

`scripts/make-entry.sh <issue> <fix commit>` starts a `method: inverse` entry from a fix commit. It saves the fix's diff without its test files as `bugs/<issue>/inverse.patch`, writes `record.yaml` next to it and adds the entry's line to `bugs/INDEX.jsonl`. `base_commit` is the `HEAD` of `CORPUS_WORKTREE`. The status is `pending` when the patch applies there with `git apply -R`, and `stale` when it doesn't.

The script can't work out `fix_tests`, the `bug` fields or the `hint`, so it writes `TODO` in them, in the record and in its index line. Fill them in, then verify the entry as below before setting the status to `live`.

## Verifying an entry

Check out `mutant.base_commit` in a separate worktree and run the hint test there twice, once clean and once with the mutant applied:

```sh
entry=$PWD/e2e/regression-corpus/bugs/25614
git worktree add ../corpus-check 8317274709c
cd ../corpus-check && bun install
git apply "$entry/rebuilt/witness.patch"
bun run test-unit frontend/src/metabase/viz-core/echarts/cartesian/model/trend-line.unit.spec.ts
git apply "$entry/rebuilt/mutant.patch"
bun run test-unit frontend/src/metabase/viz-core/echarts/cartesian/model/trend-line.unit.spec.ts
```

The first run should pass and the second should fail with the hint's expected failure.

- Skip the witness step when there's no `witness.patch`.
- Use `git apply -R` for `method: inverse`. A few July patches only apply at `8317274709c` with `git apply --3way`, and their notes say so.
- For a deftest hint, run `./bin/test-agent :only '[<namespace>/<test>]'` instead of jest.
- `test-unit` rebuilds the ClojureScript before running jest, which a `.cljc` mutant needs because jest imports the compiled output. `test-unit-keep-cljs` skips the rebuild when the patch only touches TypeScript.
- Run the whole spec file rather than filtering with `-t`, because test names often have brackets and parentheses in them.

A test kills a mutant when it passes on clean code, fails on the mutant, and fails again when rerun on its own. The failure can be an assertion, or it can be the bug's own symptom, such as a `cy.wait` for a request the mutant never sends or a click refused by a control the mutant leaves disabled. A symptom failure is a kill because CI would go red. It's flagged as a symptom kill, because a change to timeouts or retries can lose it. The type checker or the API contract checker rejecting the mutant is also a kill, at that layer. That covers a mutant that breaks compilation: the type checker kills it, and it stays in the results. A setup crash, a harness error, a failing hook, or a test that also fails on clean code is an error, not a kill.

## Running the scripts

The scripts in `scripts/` and `generators/` take three paths from the environment:

- `REPO_ROOT` is the checkout the corpus is in. It defaults to the checkout the script sits in.
- `CORPUS_WORKTREE` is where patches get applied and tests run, and where `dispatch-e2e.sh` checks out its mutant branches. It defaults to `REPO_ROOT`, so point it at a separate worktree to keep mutants out of the checkout you're working in. The worktree needs `node_modules`, from `bun install` or a symlink to the main checkout's.
- `CORPUS_OUT` is where they write. It defaults to `local/regression-corpus/overnight` under `REPO_ROOT`, which git ignores. The generators write under `generators/` and `mutants/` in it, and the July scripts under `july-corpus/`.

## Results stay out of git

Kill runs, coverage and verdicts are produced per commit, as CI artifacts or on a local machine, and are never committed here. A record says what the bug is and how to put it back, not which tests caught it on a given day.

The July pass's write-ups, its per-entry agent reports and configs, and its CI evidence are outside git too, under `local/regression-corpus/overnight/july-corpus/` in the checkout that ran it. Where a record relies on one of their findings, its `notes` state the finding itself.

## Strata

Every mutant has a stratum, and results are broken down by it, because a suite that catches every logic bug can still miss every dropped cache tag.

- `logic`: a function computes the wrong thing.
- `wiring`: a call site or registration is removed, a prop or selector is mis-wired, or a route or response key changes on one side only.
- `state`: a cache invalidation or refetch is missing, or a field is never persisted.
- `baseline`: boot-path code such as login and the app shell, so that smoke tests have mutants to catch.

A regression gets the stratum of the fault it reintroduces.
