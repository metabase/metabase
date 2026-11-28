# Running and triaging

This step runs every generated test on the PR head, then on the parent commit where needed, and gives each test exactly one verdict. The commands are in step 8 of `SKILL.md`. Keep to one test process at a time throughout.

## 1. First run on the head

Run all generated frontend specs in one Jest invocation (label `head-1`), then all backend scratch namespaces in one `./bin/test-agent` invocation. Summarise the Jest results with `jest-summary.mjs` and the `test-agent` output with `test-agent-summary.bb`.

Sort every failure into one of two kinds:

- A harness error means the test never reached its assertion for reasons unrelated to the behaviour under test. Typical causes are a `SUITE_ERROR` line (syntax error, bad import, a module that does not exist at that path), an unmocked endpoint (`No fallback response defined for GET /api/...`), a missing provider or store slice, or a fixture that fails schema validation. A failed query or selector is a harness error too when the DOM dump in the failure shows the element the test means under another name or in another case, such as `getAllByPlaceholderText("label")` against the placeholder "Label". When the element is not there at all, it is an assertion failure. On the backend, a namespace that does not compile (`Unable to resolve symbol`, `Could not locate ... on classpath`) shows as `LOAD_ERROR`. One such file stops every backend test in the run, so repair or drop it first and rerun before you sort anything else.
- An assertion failure means the test ran its actions and an `expect` or `is` disagreed. A thrown error from the code under test also counts here, because a crash on a valid input is a result.

## 2. Repair harness errors, within fixed rules

You may change only these parts of a test:

- import paths and imported names, including a misnamed var behind a required alias (`No such var: sso-settings/jwt-idp-uri`), when the test's own setup or title names the var it means,
- mock endpoints and their responses, when the response is a well-formed default (an empty list, a mock entity),
- provider, store and router setup,
- fixture construction, to make a fixture valid,
- a query or selector that matches nothing, to match the element the DOM dump shows the test means,
- timer setup.

You must not change these parts:

- assertions or expected values,
- the user actions or calls the test makes,
- the scenario or the risk it tests,
- the test's name.

This applies to blind tests too. You have seen the diff, so a repair to a blind test must be mechanical: if fixing it needs knowledge of how the code works, drop the test as unrunnable instead. Write every repair to `repairs.md` as one line: the file, the test, what was wrong and what you changed.

Repair at most twice per file, rerunning after each round. Label the reruns `head-1-r1` and `head-1-r2`. After a backend `LOAD_ERROR`, rerun every generated namespace, because none of their tests ran. In `triage.tsv`, the head-1 column holds each test's result from the last run that included it, and `repairs.md` keeps the history. A test still failing with a harness error after two rounds is unrunnable. Delete it from the head worktree, and record it in `triage.tsv` with the verdict `unrunnable`. If that leaves its file with no tests, delete the file and its line in `manifest.tsv`, because step 9 of `SKILL.md` stops when a file in the manifest has no copy.

## 3. Rerun every failure once

Rerun every spec that has an assertion failure (label `head-2`), filtered with `-t` to the failing tests. End each id in the pattern with the character that follows it in the title, such as `"S3 |R2:"`, because `S1` also matches `S13`. Tests that `-t` filters out show as `PENDING` in the summary, so ignore those lines. For backend tests, list each failing test as `<namespace>/<test name>` in `:only`, which selects exactly those tests, and give the summary script the same files as before: it prints only the tests the run selected. A test that passes on the rerun is a flake. Record it as `flake` and stop there. A test that fails both times goes on to the parent commit.

## 4. Run on the parent commit

Copy every remaining generated file into the parent worktree at the same relative path, and run them all there (label `parent-1`). Then rerun every frontend spec that has a failing test there (label `parent-2`), filtered with `-t` to the failing tests as in section 3. A Jest run takes seconds, so this costs next to nothing. A frontend test counts as failing on the parent only if it fails both times. A test that passes on the rerun flaked on the parent. Record it as `flake` with the note "flaked on the parent" and stop there. Backend tests get no rerun on the parent, because each `./bin/test-agent` call takes 1.5 to 2.5 minutes. A backend test's result in `parent-1` is its parent result.

If the code under test does not exist on the parent (a new file, a new export, a new endpoint), the test fails there by construction. Record the failure kind, because section 6 uses it.

## 5. Give each test one verdict

Give each test the first verdict in this table that applies:

| Head | Parent | Verdict | What it means |
| --- | --- | --- | --- |
| harness error after repairs | | `unrunnable` | Dropped |
| failed, then passed | | `flake` | Dropped |
| | failed, then passed (Jest only) | `flake` | Dropped |
| failed twice | failed | `pre-existing` | Fails without this PR too, so it is reported separately |
| failed twice | passed | `finding`, after the check below | The PR broke the oracle |
| passed | failed | `candidate`, after the check below | The test pins the PR's behaviour |
| passed | passed | `discarded` | It cannot tell the PR from its parent |

For a Jest test, "failed" in the Parent column means it failed both `parent-1` and `parent-2`.

Tests whose oracle is the parent's behaviour can still be `unrunnable` or a `flake`, but otherwise skip the rest of the table. Their expected values are the generator's best guess at what the parent returns, and nothing has run on the parent to check that guess, so a failure on either side may only mean the guess was wrong. Calibrate them by reading the runs you already have, not by running anything again:

1. For each case, read the parent's actual value from `parent-1`: the Received or `actual:` value if the case failed there, or the written expected value if it passed. A Jest case that failed `parent-1` and passed `parent-2` is a `flake`, not a value to calibrate from.
2. Read the head's actual value the same way, from `head-2` if the case failed `head-1`, or from `head-1` if it passed.
3. If the two values are equal, the verdict is `discarded`, because the head does what the parent does, whether or not the guess was right. If they differ, the verdict is `finding`, after the check in section 6, including question 4 on a parent value that is plainly broken. A `deftest` with several cases is a finding when any of its cases is one.
4. Once every verdict is in and nothing more will run, change each expected value that differs from the parent's to the parent's value, in the head worktree's file that step 9 copies to `tests/`, so that the repro in the report fails on the head. Add "expected values corrected from parent-1, not rerun" to the test's note. The parent is the oracle for these tests, so this is calibration, not fitting.

This works only because each case makes one assertion, as the generator reference requires. A failing `expect` ends its Jest test case, so a second assertion in the same case would never report its value. A failing `is` does not end a `deftest`, but the backend summary tells the failures of one `deftest` apart only by the `testing` context it prints for each, so each case needs its own `testing` string around a single `is`.

A `pre-existing` test whose oracle is a sentence in this PR's description needs one more look. Once it passes the check in section 6, it means the PR claims a behaviour that neither the head nor the parent has. Keep the verdict, and mark the note "the PR's claim does not hold" so the report lists it first among the pre-existing failures.

## 6. Check every finding, pre-existing failure and candidate before it counts

Most adversarial failures are test mistakes. Before a test counts as a finding or a pre-existing failure, read the failing assertion and the code it exercises, and answer these questions:

1. Does the expected value follow from the oracle? For a stated-intent oracle, does the quoted sentence really say this? For common sense, would a user really expect it?
2. Did the test do what a user or caller can do? A sequence that no real caller produces, such as calling a handler with arguments the component never passes, does not count.
3. Is the failure about the behaviour, rather than about the test's own setup? A failed query or selector counts as a problem on the test's side, the same as a harness error, unless the element is missing altogether. An element that is never found because the test queried the wrong label, or the right label in the wrong case, is a harness error that slipped through.
4. When the oracle is the parent's behaviour, is the parent's own value sound? If the parent's value is plainly broken (`NaN`, an exception, nonsense), a different value on the head is not a finding. For example, the parent saved `NaN` for a typed "-" and the head saved `null`.

If any answer is no, record the test as `invalid` with one sentence saying why. When question 4 is the reason, start the note with "the parent was wrong", because the report lists these tests as behaviour changes. Only tests that pass every question are findings or pre-existing failures.

A pre-existing failure that fails question 3 gets one repair under the rules in section 2, logged in `repairs.md`. Run it again on the head and the parent as in sections 3 and 4, and take its verdict from the table in section 5 again. If it still fails on the test's side, record it as `invalid`.

A candidate gets three checks:

- A test that fails on the parent only because a symbol it imports does not exist there (a `SUITE_ERROR` for a missing module, or `... is not a function` or React's "Element type is invalid" for a missing export) pins the symbol, not a behaviour, because any test that imports it fails there. Record it as `discarded` with the note "fails on the parent only because <symbol> does not exist there".
- Check that neither the PR's own tests nor the existing specs for the changed files already assert the same thing. If one does, record the test as `discarded` with the note "already covered by <spec and test name>".
- A test whose parent failure comes at a setup step that the PR's own tests already pin, such as the same request with the same input, and whose own assertions check behaviour the PR did not change, is already covered too. Record it as `discarded` with the note "already covered by <spec and test name>", naming the PR's test.

## 7. Write triage.tsv

Write one line per generated test, with tab-separated columns:

```
generator  file  test name  risk or scenario  oracle  head-1  head-2  parent-1  parent-2  verdict  note
```

Use `-` for runs that did not happen, which for `parent-2` means every backend test and every frontend test that passed `parent-1`. The note holds the failure line for findings and pre-existing failures, the parent failure kind for candidates, and the reason for invalid tests. For a parent-behaviour finding it holds the head's and the parent's values instead of the failure line.
