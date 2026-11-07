# Diff-informed generator

This generator writes tests against the risks in `risks.md`. It may read anything: the diff, both versions of every function, the callers and the PR's own tests. Its job is to find inputs and sequences where the head breaks the oracle named for each risk.

## Where the tests go

Write every file into the head worktree (`$WT/head`), never into your own checkout.

- Frontend: a Jest spec next to the code under test, named `<Name>.adversarial-diff.unit.spec.ts` or `.tsx`. For `ActionButton.tsx` that is `ActionButton.adversarial-diff.unit.spec.tsx` in the same directory.
- Backend: a scratch namespace next to the matching test namespace. For `src/metabase/foo/bar.clj` that is `test/metabase/foo/bar_adversarial_diff_test.clj` with `(ns metabase.foo.bar-adversarial-diff-test ...)`. Enterprise code uses `enterprise/backend/test/...` the same way.

A new file is easier to copy to the parent worktree and easier to delete than a change to an existing spec. Add a line to `manifest.tsv` for each file: `diff-informed<TAB><path><TAB><risk ids>`.

## How to write them

1. Spend the budget from `risks.md` and no more. One table-driven or property test per risk beats several near-duplicate examples.
2. Name the risk in a `describe` block, so triage can map each failure back to its oracle: `describe("R2: a parameter saved with :value nil", ...)` or `(testing "R2: a parameter saved with :value nil" ...)`. Test names follow the neighbouring spec's idiom, `should <plain verb> <behaviour>`.
3. Pick inputs that the change makes interesting. For a nil-handling change that means nil, empty, missing key and a valid value side by side. For a date change it means a year boundary, a DST change, a time zone other than the report time zone and the smallest and largest units. For an async change it means the second event arriving before the first resolves, and the component unmounting in between.
4. Assert on what the oracle says, not on what the head does:
   - Stated intent: derive the expected value from the quoted sentence in `risks.md`.
   - Parent behaviour: the expected values are whatever the parent produces. Write your best guess at the parent's value for each input, from reading the parent's code, and do not run anything to check it. Write a table of inputs as one test case per row and per observable, for example one `it.each` per observable, so each case makes one assertion. A failing `expect` ends its test case and hides the assertions after it, so this layout is what lets triage read the parent's actual value for every cell from `parent-1`, and compare it with the head's. A wrong guess costs nothing, because triage corrects the expected values from that run.
   - Invariant: compute the expected value from the input, for example `parse(format(x))` equals `x` for every row.
   - Differential: call both implementations on the same rows and compare the results.
5. Reuse the harness of the neighbouring spec: its `setup` function, its mock endpoints and its fixtures. Copy what you need into the new file rather than importing from a spec.
6. Do not run the tests on either commit. The runner in step 8 does that, and seeing a failure now is the moment a generator starts to fit its assertions to the code.

## Frontend conventions

These conventions come from the existing unit specs:

- Render with `renderWithProviders` from `__support__/ui`, and query with `screen` from the same module. User actions go through `userEvent` from `@testing-library/user-event`.
- Mock API calls with `fetch-mock` and the `setup*Endpoints` helpers in `frontend/test/__support__/server-mocks/`. Build fixtures with the `createMock*` factories from `metabase-types/api/mocks`.
- For timers, use `jest.useFakeTimers()`, make the user actions through `userEvent.setup({ advanceTimers: jest.advanceTimersByTime })`, and advance with `act(() => jest.advanceTimersByTime(ms))`, as `ChartSettingInputNumeric.unit.spec.tsx` and `FormInlineUpdater.unit.spec.tsx` do. Use `jest.useFakeTimers({ advanceTimers: true })` only when the test must also await `findBy*` or `waitFor`, because with it fake time also moves with real time, so a check such as "nothing is saved before the debounce elapses" depends on how fast the typing ran.
- `waitFor` and `findBy*` wait up to 10 seconds here (`asyncUtilTimeout` in `frontend/test/jest-setup-env.js`), which is longer than most reset timers. Check a state that must hold right after an action with a plain `expect`, or with fake timers. Otherwise the test can pass on the parent by waiting the timer out.
- CSS modules are mocked to `{}` in Jest, so a class such as `pointerEventsNone` changes nothing and a click the browser would block still goes through. A test about ignored clicks asserts the attribute or the label, or acts through the keyboard.
- Query by role, label or visible text. Use a `data-testid` only if it already exists in the component.
- No snapshot assertions. A snapshot records what the code renders today, and that is not one of the oracles.
- Keep each test well under the 10 second timeout by giving it one scenario.

## Backend conventions

These conventions come from the existing test namespaces:

- Require `[clojure.test :refer :all]` and `[metabase.test :as mt]`. Create rows with `mt/with-temp`, call endpoints with `mt/user-http-request`, and run queries with `mt/run-mbql-query` or `qp/process-query`.
- For property tests, use `clojure.test.check` (`defspec` from `clojure.test.check.clojure-test`, plus `clojure.test.check.generators` and `clojure.test.check.properties`) with at most 50 trials per property, to keep the run short.
- Lay out a parent-behaviour table the same way: one `doseq` per observable, with a `testing` string naming the row around a single `is`. A failing `is` does not end the `deftest`, and the summary prints a line for every failing `is` with the `testing` context above it, so that string is what ties each line to its row when triage reads the parent's values.
- Use `mt/test-drivers` only for a differential across drivers, and only with drivers that run locally (`:h2`, and `:postgres` if it is already running).
- Comments follow the house rule: a comment explains a wait, seed or mock whose shape would otherwise look wrong, and nothing else.
