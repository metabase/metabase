# E2e replacement check: instructions for an agent

Paste this into any coding agent running in a Metabase checkout, on the branch of a PR that deletes or shrinks Cypress e2e tests and adds unit tests in their place. The agent works out what only the deleted tests covered, breaks each of those places one at a time, and reports which breaks no test notices. Everything runs locally. Nothing is committed, pushed or posted.

## Before writing replacement unit tests

If you're the one replacing the e2e tests, run this for each component you're about to test, before writing anything:

```
node .claude/skills/e2e-replacement-check/check.mjs existing <component or spec path>
```

It lists the existing jest specs that import the component, with their test titles, and specs that reach it indirectly and name it in a test title. When a spec already tests the component, add your tests to that spec instead of starting a new one, and read its titles first so you don't repeat one.

## 1. Find what the PR deleted

From the repository root, run:

```
node .claude/skills/e2e-replacement-check/check.mjs scope
```

It prints the deleted and shrunk e2e tests with their removed assertions, the PR's new and changed unit tests, and the path to write the breaks file to. Use `--base <ref>` if the PR doesn't target `master`.

If it reports many deleted tests, the pass in step 2 can still cover the whole PR. Use `--spec <spec path>` on both `scope` and `run` only when one pass can't hold it all.

## 2. Find what only the deleted tests protected

This step reads both sides: the deleted tests at the merge base, and the e2e tests, unit tests and backend tests at the head. Do it in a fresh session or subagent, not the one that wrote the PR, because that session's reasoning is what's being checked. Don't run any tests in this step.

1. For each deleted or shrunk test, list what it did. Read it at the merge base with the `git show` command the scope step prints, and list every step through the UI, including the steps before its assertions, every helper it calls (read the helper), and its `before` and `beforeEach` hooks.
2. For each step, find the product code it drove: the component, handler, hook or endpoint.
3. Ask whether anything at the head still covers that code: a kept or merged e2e test that takes the same step, or a unit or backend test that would fail if the code stopped working. A test that only renders the component doesn't count. Name the test that would fail, and why.
4. Check the PR's new and changed unit tests against the ways a replacement usually falls short:
   - it mocks what the e2e test exercised for real
   - the behaviour has several entry points, and the unit test covers one
   - the e2e test crossed from frontend to backend, and neither side's tests check the field or request shape that joins them
   - the action's result shows up in a component the unit test never renders
   - it covers fewer roles, permissions or data variants than the e2e test did
   - a wait or readiness check sits behind the action
5. Rank the steps that nothing at the head covers, most likely loss first, and write one aimed break for each, at most 10. Fewer breaks that each target a suspected loss are better than a full budget.

Write `protected.md` beside the breaks file, with one line per step you found still covered: the step, the code it drove, and the test that protects it.

Breaks come in three kinds:

| Kind | What it does | Example |
| -- | -- | -- |
| `remove` | deletes the code that produces the behaviour | drop the `sendErrorToast(...)` call in the failure branch |
| `block` | adds code that stops an action from taking effect | `event.preventDefault()` at the top of a click handler, an early `return` |
| `wrong-value` | keeps the code but makes it produce the wrong thing | a different URL, a flipped condition, a readiness check that never passes |

Every break must:

- edit product code only, never tests, mocks or e2e support code
- change a line that runs on the deleted test's path. Follow the code from the step to the line: an `onClick` added to a link whose component stops the click in `onClickCapture` never runs
- be the smallest edit that would make the deleted test fail if it ran
- still parse and type-check
- name the deleted test by the id the scope step printed, and name in `assertion` the removed assertion line it should make fail, copied from the scope output
- say in `break` what it does in plain words, without the file and line, which the report adds

The check runs at most 2 backend (Clojure) breaks unless the user passes `--backend-limit`, so put the backend break you'd most expect a unit test to miss first. Write each break as find-and-replace edits on whole lines, with a `find` text that appears exactly once in its file. The format is in "The breaks file" in `.claude/skills/e2e-replacement-check/README.md`. Write the file to the path the scope step printed.

## 3. Run the check

```
node .claude/skills/e2e-replacement-check/check.mjs run
```

It applies each break, runs the PR's unit tests, and reverts. When nothing fails it also runs the nearest existing jest specs and the type checker. It prints the report and writes it to `report.md` in the output directory. Run one check at a time: each one starts jest workers and, for backend breaks, a JVM.

`--auto` also plants up to 25 automatic mutants in the frontend files the breaks touched. That takes several more minutes, so use it only when the user asks.

## 4. Report

Show the user the table from `report.md` as it is. Don't reword the results. A row reading "unmeasured" says why the check couldn't run it.

Then run `node .claude/skills/e2e-replacement-check/check.mjs existing` on the PR branch. Report each exact copy or prefix pair it finds, and each new spec it says should extend an existing one. Its listing of related specs doesn't need repeating.

A row reading "nothing failed" is a lead: a test the PR could add. It doesn't show that the deleted e2e test would have caught that break. Before calling it a gap, check that its changed line runs on the deleted test's path, from its patch in `details.md`, and that no kept e2e test at the head asserts the behaviour. A row that also says "no spec ran the line" needs the first check most. If a kept test covers it, name the test beside the row instead of calling it a gap.

List the "nothing failed" rows that pass both checks, and say for each which unit test could check it, without writing the tests unless the user asks. Then show the list from `protected.md` under the heading "Looked at and still protected", so a reviewer can see where the pass looked.
