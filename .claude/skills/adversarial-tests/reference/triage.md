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

Repair at most twice per file, rerunning after each round. Label the reruns `head-1-r1` and `head-1-r2`. After a backend `LOAD_ERROR`, rerun every generated namespace, because none of their tests ran. In `triage.tsv`, the head-1 column holds each test's result from the last run that included it, and `repairs.md` keeps the history. A test still failing with a harness error after two rounds is unrunnable. Delete it from the head worktree, and record it in `triage.tsv` with the verdict `unrunnable`.

## 3. Rerun every failure once

Rerun every spec that has an assertion failure (label `head-2`), filtered with `-t` to the failing tests. End each id in the pattern with the character that follows it in the title, such as `"S3 |R2:"`, because `S1` also matches `S13`. Tests that `-t` filters out show as `PENDING` in the summary, so ignore those lines. For backend tests, list each failing test as `<namespace>/<test name>` in `:only`, which selects exactly those tests, and give the summary script the same files as before: it prints only the tests the run selected. A test that passes on the rerun is a flake. Record it as `flake` and stop there. A test that fails both times goes on to the parent run.

## 4. Run on the parent commit

Copy every remaining generated file into the parent worktree at the same relative path, and run them all there (label `parent-1`). Rerun the parent failures once (label `parent-2`), and count a test as failing on the parent only if it fails both times.

If the code under test does not exist on the parent (a new file, a new export, a new endpoint), the test fails there by construction. Record the failure kind, because section 6 uses it.

## 5. Give each test one verdict

Give each test the first verdict in this table that applies:

| Head | Parent | Verdict | What it means |
| --- | --- | --- | --- |
| harness error after repairs | | `unrunnable` | Dropped |
| failed, then passed | | `flake` | Dropped |
| failed twice | failed twice | `pre-existing` | Fails without this PR too, so it is reported separately |
| failed twice | passed | `finding`, after the check below | The PR broke the oracle |
| passed | failed twice | `candidate`, after the check below | The test pins the PR's behaviour |
| passed | passed | `discarded` | It cannot tell the PR from its parent |

Tests whose oracle is the parent's behaviour were calibrated on the parent in the generator step, so they pass there by construction. For them, a head failure is a finding, after the check in section 6, and a pass is a discard.

A `pre-existing` test whose oracle is a sentence in this PR's description needs one more look. Once it passes the check in section 6, it means the PR claims a behaviour that neither the head nor the parent has. Keep the verdict, and mark the note "the PR's claim does not hold" so the report lists it first among the pre-existing failures.

## 6. Check every finding, pre-existing failure and candidate before it counts

Most adversarial failures are test mistakes. Before a test counts as a finding or a pre-existing failure, read the failing assertion and the code it exercises, and answer these questions:

1. Does the expected value follow from the oracle? For a stated-intent oracle, does the quoted sentence really say this? For common sense, would a user really expect it?
2. Did the test do what a user or caller can do? A sequence that no real caller produces, such as calling a handler with arguments the component never passes, does not count.
3. Is the failure about the behaviour, rather than about the test's own setup? A failed query or selector counts as a problem on the test's side, the same as a harness error, unless the element is missing altogether. An element that is never found because the test queried the wrong label, or the right label in the wrong case, is a harness error that slipped through.
4. When the oracle is the parent's behaviour, is the parent's own value sound? If the parent's value is plainly broken (`NaN`, an exception, nonsense), a different value on the head is not a finding. For example, the parent saved `NaN` for a typed "-" and the head saved `null`.

If any answer is no, record the test as `invalid` with one sentence saying why. When question 4 is the reason, start the note with "the parent was wrong", because the report lists these tests as behaviour changes. Only tests that pass every question are findings or pre-existing failures.

A pre-existing failure that fails question 3 gets one repair under the rules in section 2, logged in `repairs.md`. Run it again on the head and the parent as in sections 3 and 4, and take its verdict from the table in section 5 again. If it still fails on the test's side, record it as `invalid`.

A candidate gets two checks:

- A test that fails on the parent only because a symbol it imports does not exist there (a `SUITE_ERROR` for a missing module, or `... is not a function` or React's "Element type is invalid" for a missing export) pins the symbol, not a behaviour, because any test that imports it fails there. Record it as `discarded` with the note "fails on the parent only because <symbol> does not exist there".
- Check that neither the PR's own tests nor the existing specs for the changed files already assert the same thing. If one does, record the test as `discarded` with the note "already covered by <spec and test name>".

## 7. Write triage.tsv

Write one line per generated test, with tab-separated columns:

```
generator  file  test name  risk or scenario  oracle  head-1  head-2  parent-1  parent-2  verdict  note
```

Use `-` for runs that did not happen. The note holds the failure line for findings and pre-existing failures, the parent failure kind for candidates, and the reason for invalid tests.
