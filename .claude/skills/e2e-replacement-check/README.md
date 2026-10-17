# E2e replacement check

`check.mjs` runs on the branch of a PR that deletes Cypress e2e tests and adds unit tests in their place. An agent works out which code only the deleted tests covered and writes one aimed break for each place. `check.mjs` applies the breaks one at a time, runs the PR's tests against each, and reports the breaks no test notices. It runs in your own checkout, with no CI and no e2e runs. The agent's reasoning took 6 to 27 minutes on the PRs it was tried on, and the run after it takes 1 to 3 minutes for a frontend-only PR and about 9 for one with backend breaks.

The output is a table for the PR body. These two rows are from a run on #82953 "Move data model error-handling coverage from e2e to unit tests", before review added the table actions menu tests:

| Deleted e2e test | Break | Result |
| -- | -- | -- |
| data-model-shared-4 › shows toast errors and preview errors | drop the table name failure toast in the table update handlers (`use-table-update-handlers.ts:34`) | caught: TableSection › TableSection error handling shows an error toast when updating the table name fails |
| data-model-shared-4 › shows toast errors and preview errors | return early from the Re-sync schema handler in the table actions menu, so the click sends no request and shows no toast (`TableActionsMenu.tsx:42`) | nothing failed |

## How do I run it?

An agent does the reasoning, and `check.mjs` does the rest. There are three ways to drive it:

- **Claude Code:** run `/e2e-replacement-check` on your PR branch.
- **Any other agent:** paste `.claude/skills/e2e-replacement-check/PROMPT.md` into it.
- **By hand:** run `node .claude/skills/e2e-replacement-check/check.mjs scope`, write the breaks file yourself, then run `node .claude/skills/e2e-replacement-check/check.mjs run`.

If you're writing the replacement tests yourself, start with `existing`, described below.

The reasoning step is in "2. Find what only the deleted tests protected" in `PROMPT.md`. For each deleted or shrunk test, the agent lists every step it took through the UI, including setup, finds the code each step drove, and asks whether a kept e2e test or a unit or backend test would still fail if that code broke. It writes one break for each step where the answer is no, at most 10, and lists the steps it found still covered, with the covering test, in `protected.md`. Run it in a fresh session, not the one that wrote the PR.

When `scope` finds more than 20 deleted or shrunk tests, it lists the spec files with their counts. A single pass has handled a PR with 121. `--spec <spec path>` on both `scope` and `run` limits a run to a few spec files, each with its own output folder.

It needs what running jest locally needs: frontend dependencies installed and ClojureScript built (`bun run build:cljs`). Backend breaks also need what `./bin/test-agent` needs.

## Is there already a spec for this?

`node .claude/skills/e2e-replacement-check/check.mjs existing <path>` lists the tests that already cover a frontend component or a Clojure namespace. A `.clj` or `.cljc` path goes to the backend lookup and any other path to the frontend one. With no path, on a PR branch, it does both for every jest spec and deftest the PR adds or changes, and flags duplicates involving the PR's new tests.

Run it before writing a replacement unit test, and add to the spec or test namespace it lists instead of starting a parallel one.

For a frontend component it lists the jest specs that import it, directly or through a test `setup` file, with their test titles. It also lists up to 3 specs that reach the component through other modules and name it in a test title, and counts the rest. Given a spec, it flags tests in that spec that copy, or are the opening steps of, a test in one of those specs. It takes 2 to 10 seconds.

For a Clojure source file it lists the conventional test file (`src/.../impl.clj` and `test/.../impl_test.clj`, and the same in `enterprise/backend` and `modules/drivers/*`), then the test files whose `ns` form requires the namespace, nearest first. Each file shows up to 12 deftest names, those sharing words with the deftests you're looking at first. After 10 requiring files it counts the rest: `src/metabase/driver.clj` has 165 more. Given a test file, it finds the source by the same convention, or else through the test namespaces it requires, and flags exact copies against the other test files for that source and the test files in the same directory. It takes under a second for a path and about 2 seconds on a PR branch.

On master, given a test file of the Mongo driver, it prints:

```
modules/drivers/mongo/test/metabase/driver/mongo/database_test.clj (metabase.driver.mongo.database-test) has 4 deftests.
  It tests modules/drivers/mongo/src/metabase/driver/mongo/database.clj (metabase.driver.mongo.database), by naming convention. Other test files for it:
    modules/drivers/mongo/test/metabase/driver/mongo/connection_test.clj, by require (8 deftests)
      warehouse-inet-address-resolver-test
      fqdn?-test
      srv-conn-str-test
      srv-connection-properties-test
      additional-connection-options-test
      test-ssh-connection
      hard-password-test
      application-name-test

Exact copies involving modules/drivers/mongo/test/metabase/driver/mongo/database_test.clj:
  Exact copy: this file's metabase.driver.mongo.database-test/fqdn?-test (modules/drivers/mongo/test/metabase/driver/mongo/database_test.clj:7) and existing metabase.driver.mongo.connection-test/fqdn?-test (modules/drivers/mongo/test/metabase/driver/mongo/connection_test.clj:50)
```

It flags the kinds of duplicate that a scan of every unit test on master found reliable when read by hand:

- **Exact copies of jest tests:** the same body once local names are renumbered, every other name pointing at the same import, and the same `beforeEach` hooks. Bodies under 25 tokens are left out, since one-line checks repeat on purpose.
- **Prefix pairs of jest tests:** the same hooks, and one test's statements are the opening statements of another's. The scan checked these within a file. Across files, the command also requires the shorter test's names to point at the same imports.
- **Exact copies of deftests:** the same body once namespace aliases are expanded, the file's own definitions are qualified with its namespace and `::` keywords are made full. There's no separate rule for drivers or editions: none of the 16 groups of identical deftests on master mixes OSS and enterprise tests, and a test's driver list is part of its body.

It doesn't flag the same body with different imports: in the scan, all 16 of those were forked components. It doesn't flag the same assertion written in two specs either. In #82973 "Replace upload-permission e2e tests with unit coverage" the same "no Upload data button" assertion sits in a `CollectionHeader` test that passes `canUpload` as a prop and a `CollectionContent` test that gets it from the API, and review asked for both. On the backend it misses copies between test files that cover different namespaces in different directories.

## What does a row say?

The result column holds one of these:

| Result | Meaning |
| -- | -- |
| `caught: <spec> › <test>` | one of the PR's unit tests failed on the break with an assertion, again on a rerun, and passed on clean code |
| `nothing failed in this PR's tests; caught by existing <spec> › <test>` | an existing spec near the changed file caught it |
| `nothing failed in this PR's tests; caught by the type checker` | only the type checker noticed |
| `nothing failed` | no unit test that ran noticed the break. This is a lead for a test the PR could add |
| `nothing failed; no spec ran the line` | as above, and coverage shows that neither this PR's specs nor the related ones executed the changed lines. Check first that the line runs on the deleted test's path at all |
| `unmeasured: <reason>` | the check couldn't measure this break, and says why |

"nothing failed" doesn't mean the deleted e2e test would have caught the break, because the check never runs e2e tests. On the one PR where that was measured with e2e runs, removed e2e tests caught 27 of the 85 planted mutants that no unit test caught.

A "nothing failed" row can also be a break that changes nothing a user would see. On #82954 "Replace flaky help text docs link e2e test with a unit test", two of three agents cancelled the docs link's `onClick`, which never runs because `ExternalLink` stops propagation in `onClickCapture`. Read the patch for each "nothing failed" row in `details.md` before treating it as a gap. The `assertion` field names the removed assertion each break should have failed, which makes that check quicker.

Below the table, the report lists any of the PR's own tests that fail on clean code in your checkout, since no break was measured against them.

A failure only counts as caught when it's an assertion failure (or an exception thrown from spec code), it reproduces on a rerun with the break applied, and the test passes again on clean code. An error thrown from product code, a timeout, or a failure that doesn't reproduce shows as unmeasured, not caught.

## What does it miss?

The pass was tried on three merged PRs where review had found a gap in the replacement tests. One fresh agent per PR ran it at the commit the reviewer saw:

| PR | Reviewer's finding among the suspected losses | Breaks | `run` result |
| -- | -- | -- | -- |
| #82953 (above) | yes: the table actions menu's failure toasts | 3 | 3 nothing failed |
| #82954 "Replace flaky help text docs link e2e test with a unit test" | yes: a cancelled click on the Learn more link | 2 | 2 nothing failed |
| #82973 "Replace upload-permission e2e tests with unit coverage" | half: the collection page's read of `can_upload`, yes. The new sandbox deftest passing for the wrong reason, no | 4 | 4 nothing failed |

It has two limits:

- The run confirms that no unit test notices a break. It can't show that the deleted e2e test would have, so it can't catch a pass that suspects too much. Every break above read "nothing failed".
- It looks for lost coverage, not for a weak new test. On #82973 an existing deftest still covers the sandbox check, so the pass listed that step as protected, and the new deftest's flaw stays something a reviewer has to read for.

## What does a run do?

`run` works through these steps:

1. Runs the PR's jest specs on clean code with coverage of the files the breaks touch. Tests that fail on clean code are left out.
2. Lists the 10 specs nearest each touched file from `jest --findRelatedTests`, leaving out the PR's own, and runs them on clean code the same way.
3. For each break: applies it, runs the PR's specs, reruns any failing spec, reverts, and reruns the failing specs on clean code. When nothing fails, it repeats this with those related specs of the break's files that loaded the files on clean code, and then runs the type checker.
4. For backend breaks, at most 2 per run by default: runs the PR's changed deftests and the test namespace of each touched file through `./bin/test-agent`, once on clean code and once per break. Breaks over the limit show as unmeasured, and `--backend-limit <n>` raises it. Deftests under `modules/drivers/<driver>/test` run only when `DRIVERS` includes that driver, and the report says when they didn't.
5. With `--auto`, plants up to 25 automatic mutants in the frontend files the breaks touched, by removing calls, props, cache tags, refetches, persisted fields and branches, or renaming keys, and runs each against the specs that executed its lines.

Steps 2 and 3's type check can be turned off with `--no-related` and `--no-type-check`.

## Does it leave my working tree alone?

It refuses to start when any file a break touches has uncommitted changes. Backend runs delete the old result files in `target/junit` before each `./bin/test-agent` call. Each break is applied and reverted inside `try`/`finally`, and Ctrl-C or `SIGTERM` stops the test process and reverts before exiting. Before writing a break it copies the original files into `.git/e2e-replacement-check/` and writes a marker there, so a run killed outright is restored by the next run, or by `node .claude/skills/e2e-replacement-check/check.mjs restore`. At the end it checks that `git status` for the touched files is empty, and says so.

A running dev server or watcher sees each break appear and disappear: the frontend's `rspack serve` rebuilds on every change outside `node_modules`, and a backend started with `--hot` reloads changed files on its next request. Stop them during a run, or expect rebuild noise.

Output goes to a directory under the system temp directory, named after the checkout and branch. `--out <dir>` picks another one, and the command refuses a directory inside the repo that git doesn't ignore.

## The breaks file

The breaks file is JSON. `scope` prints where to write it.

```json
{
  "breaks": [
    {
      "id": "1",
      "test": "e2e/test/scenarios/data-model/data-model-shared-4.cy.spec.ts::data model > ${…} Error handling shows toast errors and preview errors",
      "assertion": "verifyAndCloseToast(\"Failed to start sync\");",
      "checks": "a failed sync from the table actions menu shows the toast Failed to start sync",
      "break": "drop the sync failure toast in the table actions menu",
      "kind": "remove",
      "edits": [
        {
          "file": "frontend/src/metabase/data-studio/data-model/components/TableSection/components/TableActionsMenu/TableActionsMenu.tsx",
          "find": "      sendErrorToast(t`Failed to start sync`);\n",
          "replace": ""
        }
      ]
    }
  ]
}
```

The fields are:

| Field | Content |
| -- | -- |
| `test` | the deleted test's id, as `scope` prints it |
| `assertion` | the removed assertion line the break should make fail, copied from the `scope` output |
| `checks` | what that assertion checked, in plain words |
| `break` | what the break does, in plain words. This text goes in the table, which adds the file and line |
| `kind` | `remove`, `block` or `wrong-value` |
| `edits` | one or more edits to product files. `find` must appear exactly once in the file, and `replace` is what goes in its place |

A break can edit several files, but only on one side: frontend or backend. Edits to test files are refused.

The reasoning pass also writes `protected.md` beside the breaks file: one line per step it found still covered, with the covering test. `check.mjs` doesn't read it, and the report step shows it under "Looked at and still protected".

## How long does it take?

With the default options, one check at a time on an otherwise idle 14-core laptop, these took:

| PR | Breaks | `scope` | `run` |
| -- | -- | -- | -- |
| #82954, one deleted test | 5 frontend | under 1 s | 1 min |
| #82953, one deleted test | 8 frontend | under 1 s | 2.7 min |
| #82973, two deleted tests | 9 frontend and 3 backend, 2 of them run | under 1 s | 8.8 min, 6.3 of them on the backend |
| a folder-sized PR, 121 deleted or shrunk tests in 9 specs | 18 frontend and 2 backend | under 1 s | 9.3 min, 5.7 of them on the backend |

The reasoning pass in step 2 took 6 to 27 minutes on small PRs like the first three.

Backend breaks take most of the time. Each one takes one `./bin/test-agent` call when nothing fails and three when something does, plus one clean call shared by all of them. Each call took 1 to 2 minutes here, because it included a large test namespace, `metabase.upload.impl-test`. `--backend-limit` raises the cap of 2.

`--auto` adds the automatic mutants. On #82953 they added 7.5 minutes to a run.

Run one check at a time. Two checks at once, each with jest workers and a JVM, pushed a 36 GB laptop into swap, and some jest runs then took 15 minutes instead of seconds.

## Tests

```
node --test '.claude/skills/e2e-replacement-check/test/*.test.mjs'
```
