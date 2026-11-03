# Naming the risks

This step turns the diff into a short ranked list of risks, each with the oracle that decides whether a test against it passes. Nothing gets a test without an oracle, because a test without one can only record what the code does today.

## What to read

Read these, in this order:

1. `context/pr.json` and `context/issues/*.md`, for what the author says the change does and what it must not change.
2. `git -C "$WT/head" diff --stat "$MERGE_BASE" HEAD`, then the full diff of every non-test file.
3. For each changed function or component, the whole function at the head and at the parent (`git show "$MERGE_BASE":<path>`), and its callers (`git -C "$WT/head" grep -n <name>`). A change to a shared helper is a risk for every caller, including the callers the PR does not mention.
4. The PR's own test changes. They show what the author already covers, so you can spend the budget elsewhere.

## What makes a change risky

Rank each changed function as high, medium or low.

These changes rank high:

- Branching on the shape of the input: optional fields, unions, `type` or `display` switches, legacy versus current formats.
- Handling of nil, `undefined`, empty strings, empty lists and missing keys.
- Dates, times, time zones, temporal units and bucketing.
- Query parameters, template tags, filters and their default values.
- Formatting of numbers, currencies, percentages and column names.
- Permissions, sandboxing, and anything that decides who sees what.
- Async ordering: promises that resolve after unmount or after a reset, timers, debounces, request races.
- Anything the PR description calls a pure refactor, a cleanup or "no behaviour change". These claims are cheap to make and expensive to check by reading, so they always rank high.

Medium is a change to logic that the PR's own tests already exercise from more than one angle, or a change to a function with one caller. Low is renames, moved code with an unchanged body, copy changes and styling. Low risks get no tests unless one is very cheap.

## Choosing the oracle

Every risk gets exactly one oracle, picked by the kind of claim it tests:

| Oracle | Use it for | What the test asserts |
| --- | --- | --- |
| Parent behaviour | "No behaviour change" claims, refactors, and callers the PR does not mean to change | The head returns what the parent returns for the same input. Expected values come from the parent commit, not from reading the head. |
| Stated intent | New behaviour that the PR title, body or a linked issue describes | What the text says should happen. Quote the sentence the assertion comes from. |
| Invariant | Data transforms: serialisation, normalisation, parsing, formatting | A property over a table of inputs: a round trip returns the input, applying twice equals applying once, order or count is preserved, no valid input throws. |
| Differential | Two implementations of one thing: two drivers, lib versus legacy, an old helper and its replacement | Both implementations agree on the same table of inputs. |

If no oracle fits, the risk goes in the list marked "no oracle", with one sentence on what a reviewer should check by hand, and gets no tests.

## Budget

The budget is per risk, not a flat count:

- High: up to three tests.
- Medium: one test, two if the risk has two distinct failure modes.
- Low: none.

A table-driven test (`it.each`, or a `doseq` over a vector of cases in Clojure) counts as one test however many rows it has. Prefer one table-driven or property test per risk over several near-duplicate examples.

## Output

Write `risks.md` in this shape. Keep it short, because the report quotes it.

```markdown
# Risks for <PR number and title, or branch name>

Merge-base: <sha>. Head: <sha>.

| Id | Rank | Where | What could go wrong | Oracle | Budget |
| --- | --- | --- | --- | --- | --- |
| R1 | high | `formatDateTimeRangeWithUnit` in `frontend/src/metabase/lib/formatting/date.tsx` | A range from 2024-12-30 to 2025-01-02 shows no year on its start date | Stated intent: "the year is always shown when a range spans two years" | 2 |
| R2 | high | `normalize-parameter` in `src/metabase/parameters/schema.clj` | A parameter saved before this change, with `:value nil`, normalises to a different map | Parent behaviour | 2 |
| R3 | medium | `ParameterValueWidget`, the only caller of the formatter | An empty value now renders "Invalid date" instead of the placeholder | Parent behaviour | 1 |
| R4 | low | `date.tsx` helper renamed | Nothing observable | none | 0 |

## Risks with no oracle

- <where>: <what a reviewer should check by hand>.
```

The "What could go wrong" column names a concrete input or sequence, not a category. "A range from 2024-12-30 to 2025-01-02" can be turned into a test. "Date edge cases" cannot.
