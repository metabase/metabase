# Report template

Fill this in and write it to `report.md` in the run directory. Leave out a section only where the template says so. Quote failing assertions exactly as Jest or `test-agent` printed them, trimmed to the lines that show expected and received.

````markdown
# Adversarial tests for <PR #number: title, or branch name>

Head <short sha>, merge-base <short sha> on <base branch>. Run <run-id>.

<One or two sentences: how many findings, and whether any looks like a real bug. If there are none, say "No findings." and stop the paragraph there.>

## Findings

<For each finding, in order of how much a reviewer should care:>

### <F1>. <one sentence stating the defect, in terms of what a user or caller sees>

- Generator: <diff-informed or blind>
- Oracle: <the oracle, with the quoted sentence for stated intent>
- Risk or scenario: <R-id or S-number from risks.md or SCENARIOS.md>
- Passes on the parent commit, fails on the head, twice each.

```
<the failing assertion: expected and received>
```

Repro: `tests/<generator>/<path>.txt`, test "<full test name>". Copy it to `<repo-relative path>` and run:

```bash
bun run test-unit-keep-cljs --ci --maxWorkers=2 --testTimeout=10000 --runTestsByPath <repo-relative path> -t '<test name>'
```

<For a backend test, the run command is `./bin/test-agent :only '[<namespace>/<test name>]'` instead.>

<If there are no findings, write "None." under the heading.>

## Candidates to keep

These tests pass on the head and fail on the parent commit, and neither the PR's own tests nor the existing specs for the changed files assert the same thing. To keep one, copy it from `tests/` into the spec next to the code and rename it to match its neighbours. Nothing is folded in automatically.

| Test | Generator | Pins | Evidence on the parent |
| --- | --- | --- | --- |
| `<file>` "<test name>" | <generator> | <the behaviour, in one sentence> | <the parent failure line> |

<If there are none, write "None." under the heading.>

## Fails without this PR too

<Tests that failed on both commits. List first any whose note says "the PR's claim does not hold". Leave the section out if there are none.>

- `<file>` "<test name>" (<generator>): <the failure line>. <One sentence on what it suggests.>

## Behaviour changes where the parent was wrong

<Tests recorded as `invalid` with the note "the parent was wrong". Leave the section out if there are none.>

- `<file>` "<test name>": <the input>, where the parent gave <its broken value> and the head gives <the new value>.

## Counts

| Generator | Generated | Unrunnable | Failures on head | Flakes dropped | Pre-existing | Invalid | Findings | Candidates | Discarded |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| diff-informed | | | | | | | | | |
| blind | | | | | | | | | |

Count Jest test cases, so each `it.each` row counts once, and count backend `deftest`s. "Failures on head" counts tests that failed the first head run with an assertion failure, before reruns.

## Risks

<Paste the table from risks.md, with one more column, "Outcome": "finding F1", "held" (tests ran and passed on both commits), "candidate" or "not tested".>

## How this run was done

- Blind generator: <"claude -p in a restricted sandbox" or "Agent call, blind by instruction only">.
- Harness repairs: <number>, listed in `repairs.md`.
- Not read: <Linear issues that could not be fetched, or "nothing">.
- Uncommitted changes in the checkout, which were not tested: <"none" or the list>.
- Commits on the branch after the PR head, which the PR description does not cover: <"none", "no PR" or the list>.
````
