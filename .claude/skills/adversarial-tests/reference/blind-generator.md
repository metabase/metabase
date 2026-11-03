# Blind test generator

You are writing tests for a change to Metabase, an open-source BI tool with a React and TypeScript frontend and a Clojure backend. You cannot see the code that changed. You can see `context.md` in this directory, which holds:

- what the author says the change does: the PR title and description, or the branch's commit messages,
- the text of any linked issues,
- the public surface of every changed file at the PR head: component names and prop types, exported function signatures, endpoint paths and their schemas, with bodies elided as `{ … }` or `…`, plus a line naming which declarations the change touched,
- the setup half of the existing tests next to the changed files, as they were before the change, to show how the code is rendered or called.

You have the Read and Write tools and nothing else. You cannot open any file except `prompt.md` and `context.md`, and you can only write inside `out/`. Do not try to reach anything else.

## What to write

Write tests from the point of view of the people who use the change:

- For frontend code, a person using the product. Render the component, interact with it the way a user would, and assert on what the user sees.
- For backend code, an API consumer or a query author. Call the endpoint or the public function and assert on what comes back.

Aim for about a dozen distinct scenarios across the whole change. A scenario is a different situation a user could be in, not a different value in the same situation. Spend the budget on breadth: the main path the description promises, the paths it says still behave as before, and the edges a user reaches without trying (an empty value, a cancelled dialog, a second click, a slow response, a failure, a rename, a reload).

## The oracle

Your expected values come from two sources only:

1. What the description and the issues say. When an assertion comes from a sentence there, quote that sentence in `out/SCENARIOS.md`.
2. Product common sense, meaning what any Metabase user would expect. Some examples of the kind of expectation this covers:
   - Saving and then reopening shows what was saved.
   - Cancelling a dialog leaves things as they were before it opened.
   - A filter with no value filters nothing.
   - A button that says it did something has done it, and a failure says so.
   - Clicking the same control twice in a row does not do the action twice unless it is meant to.
   - Renaming something shows the new name everywhere it appears.

Do not guess implementation details. If the description does not say what happens in a situation and common sense does not settle it, leave that situation out.

## Frontend harness

Most frontend tests in this repo look like this:

```tsx
import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupCardEndpoints } from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { createMockCard } from "metabase-types/api/mocks";

import { SomeComponent } from "./SomeComponent";

function setup(props = {}) {
  const onChange = jest.fn();
  renderWithProviders(<SomeComponent onChange={onChange} {...props} />);
  return { onChange };
}

describe("SomeComponent", () => {
  it("should show the saved name after saving", async () => {
    const { onChange } = setup();
    await userEvent.type(screen.getByLabelText("Name"), "Orders");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onChange).toHaveBeenCalledWith("Orders");
  });
});
```

Follow these rules for frontend files:

- Import the code under test with a relative path from the spec's own directory, using the export names from the surface in `context.md`.
- Use the harness reference in `context.md` for which providers, mocks and fixtures a component needs. Copy its `setup` function into your file if it helps.
- Query by role, label or visible text. Use a `data-testid` only if the harness reference uses it.
- For timers, use `jest.useFakeTimers({ advanceTimers: true })` and `act(() => jest.advanceTimersByTime(ms))`, with `act` from `__support__/ui`.
- `waitFor` and `findBy*` wait up to 10 seconds in this repo, longer than most timers in the UI. Check a state that must hold right after an action with a plain `expect`.
- CSS is not loaded in these tests, so `pointer-events: none` and similar styles do not stop a click. A test about a control that ignores clicks checks its label or attributes, or uses the keyboard.
- No snapshot assertions. No test may need more than 10 seconds.

## Backend harness

Most backend tests in this repo look like this:

```clojure
(ns metabase.foo.api-adversarial-blind-test
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]))

(deftest create-then-fetch-test
  (testing "a timeline saved through the API comes back with the same name"
    (mt/with-temp [:model/Collection {coll-id :id} {}]
      (let [created (mt/user-http-request :crowberto :post 200 "timeline"
                                          {:name "Launches" :collection_id coll-id})]
        (is (= "Launches"
               (:name (mt/user-http-request :crowberto :get 200 (str "timeline/" (:id created))))))))))
```

Follow these rules for backend files:

- `mt/user-http-request` takes a test user (`:crowberto` is an admin, `:rasta` is not), a method, the expected status, and the path without `/api/`.
- `mt/with-temp` creates rows that are deleted after the body. Models are named like `:model/Card`, `:model/Dashboard`, `:model/Collection`.
- Queries against the sample data go through `(mt/run-mbql-query venues {:filter [:= $price 1]})` and friends.
- In query results a joined column's `:name` is its own column name, with `_2` added when another column already has it (`ID_2`). The join alias appears only in its `:display_name`, as in `"Model → Category ID"`.

## Output

Write each test file to `out/<repo-relative path>`, next to the changed file it tests:

- Frontend: `<dir>/<Name>.adversarial-blind.unit.spec.tsx` (or `.ts`), where `<dir>` is the changed file's directory.
- Backend: replace `src/` with `test/` and add `_adversarial_blind_test` before `.clj`, with a matching `ns` form. For `src/metabase/foo/api.clj` that is `out/test/metabase/foo/api_adversarial_blind_test.clj` with `(ns metabase.foo.api-adversarial-blind-test ...)`.

Then write `out/SCENARIOS.md`, one numbered line per test:

```
1. <test name>: <file>. Oracle: "<quoted sentence>" | common sense: <the expectation in plain words>
```

Name each test `should <plain verb> <behaviour>`, and number the tests `S1`, `S2` and so on in their `describe` or `testing` titles, so the runner can match results to this list. When you are done, reply with the list of files you wrote and nothing else.
