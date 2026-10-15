---
name: e2e-to-unit
description: Find Cypress e2e tests that do not exercise a true end-to-end path (render-only or fully mocked), move their coverage to Jest unit tests, and delete them. Use when asked to audit, slim down, or migrate e2e specs in e2e/test/scenarios/ to unit tests.
allowed-tools: Read, Grep, Glob, Bash, Edit, Write
---

# E2E to unit test migration

Use this skill to find e2e tests that a Jest test can replace, to move their coverage, and to delete them. The goal is to keep only e2e tests that need a real backend, a real browser, or both.

Before you edit a test file, load **typescript-write**. Read `frontend/CLAUDE.md` for the unit test setup pattern and the server-mock helpers.

## Hard rules

- Do not run Cypress locally. Classify each test by reading its source. CI runs the e2e specs that remain.
- Change test files and test support only (`*.unit.spec.*`, `__support__/`, the e2e spec). Do not change production source or types without explicit approval, even when you find a bug. Report the bug and wait. A product rule stated in chat is not approval, and it can be wrong.
- Do not delete an e2e test until each of its assertions maps to a unit test that passes. Cite `file:line` for each one. A file name that matches is not proof of coverage.
- The bucket comes from what the test **does** (Step 1), not from how well you understand the source. A test with no UI action that reaches the backend is A or B, even if its assertions confuse you. If an assertion does not agree with the component source, do not keep the test because of that. Render the same state in a unit test (see [Probe with a unit render](#probe-with-a-unit-render)). The probe shows the real behavior.
- Make sure that each new unit test can fail (see [Step 4](#step-4-prove-that-the-test-can-fail)). This is mandatory for tests that assert absence, a count, or a tracking event.
- Keep the scope to the spec that you were given. Do not move tests into other e2e specs.

## Step 1: Classify each test

Read the full spec. Put each `it()` into one bucket. Write the bucket and a one-line reason.

| Bucket | Meaning | Action |
|---|---|---|
| **A: Fully mocked** | `cy.intercept(..., { body })` or `req.reply(...)` stubs the data that the test asserts on. The real backend only serves the page. | Migrate |
| **B: Render-only** | The test visits a page, or seeds state through the API, and then only asserts on static UI. It does no action whose effect goes through the backend. | Migrate |
| **S: Contract seam** | A UI action sends a request, and the test checks how the UI shows the response. A backend test already pins that response (status and body). | Migrate the UI half. See [Step 1b](#step-1b-check-each-round-trip-for-a-contract-seam). |
| **C: True e2e** | The value of the test comes from the integration itself. See [Signals for C](#signals-for-c-keep). | Keep |

### Signals for A and B

- `cy.intercept` with a stubbed body for the endpoint that the assertions read.
- Only `should("exist" | "be.visible" | "contain" | "have.attr")` after `cy.visit`, with no `click` or `type` that reaches the backend.
- The assertions depend only on a token or plan, a setting value, or a feature flag. These are props or state in a unit test.
- A Snowplow assertion on a view or click event. In Jest, `metabase/analytics` is mocked automatically.
- A comment that says a behavior "can't be tested in unit tests". Check it. Such comments are often out of date.

### Signals for C (keep)

A request to the backend is not sufficient. Keep the test only if one of these is true:

- The assertion reads data that the backend computes from the database, **and** Step 1b finds no backend test that pins that data. Query results and settings are not enough alone. If a backend test pins the result for the same setting, and the frontend step that formats the result can be tested alone, the test is S.
- The test writes through one endpoint and reads back through a different one, for example `cy.reload()` after a save. A unit test with mocks cannot show that the two endpoints agree.
- The flow crosses several endpoints, and the state of one depends on another.
- The test uses a service that the CI stack runs for this purpose (for example a mail catcher or a webhook tester).

These are **not** reasons to keep a test:

- A third-party API on the internet. The CI result depends on that service. Treat it as a risk, not as coverage.
- A backend validation error shown in the UI. This is usually a contract seam (Step 1b).

## Step 1b: Check each round trip for a contract seam

Do this for **every** test that you put in C. A round trip alone does not make a test C.

1. Find the endpoint that the UI action calls, and the backend test for that endpoint:
   `grep -rn "<endpoint path>" test/ enterprise/backend/test/`
2. Find the case in the backend test that makes the same response: the same status, and the same body or `:errors` shape. Note the `file:line`.
3. If that case exists, the backend half is covered. Put the test in **S**. Migrate the UI half: a unit test that mocks the same status and body, and asserts what the user sees.
4. If the backend test does not exist, keep the test in C. Report the missing backend test.

Focus on Jest. Add a backend test only when it fills a real gap: the e2e test is the only thing that proves a backend behavior, and a short e2e test cannot keep that proof instead. Backend changes need reviewers from outside the team that does this work. When in doubt, keep a short e2e test for the round trip and move the rest to Jest.

### Partial intercepts

`cy.intercept(url, (req) => req.continue((res) => { res.body.x = ... }))` changes only part of a real response. It is difficult to know the full state that the page gets from reading the test. Do not try to work it out from the source for a long time. Find the inputs from the backend, then render that state in a unit test.

Before you guess, check which endpoint each hook really calls. A hook can be an alias of a hook for a different endpoint.

### Negative assertions that pass without proof

An assertion of absence that comes immediately after `cy.visit`, before an assertion that waits for content, can pass while the page is still loading. It proves nothing. Do not copy assertions like this into the unit test. Assert the real behavior that the probe shows, and report the incorrect e2e assertion.

### Probe with a unit render

When the source does not explain an assertion, add a temporary test to the spec that is closest to the component:

```tsx
it("PROBE", async () => {
  await setup({ /* the state of the e2e test */ });
  screen.debug(undefined, 100000);
});
```

Run it with `-t PROBE`, read the DOM, then replace the probe with a real test. This takes one run. Reading more source can take many lookups and still give no answer.

## Step 2: Map each assertion to unit coverage

For each A, B, or S test:

1. Find the source and the specs with one grep of the visible strings and test IDs from the test:
   `grep -rlE "string one|string two|test-id" frontend/src enterprise/frontend/src --include=*.tsx`
2. Open each spec that you find. Find the `it()` that asserts the same thing, with the same preconditions (plan, hosting, user role, setting values).
3. Make a table: e2e assertion → unit `file:line` → **covered**, **partial**, or **gap**.

Look in these places for coverage that is easy to miss:

- **Route-level harnesses** that render a full router with token features, often with one spec for each edition.
- **Component specs and page specs.** A component spec can cover what the e2e test checks at page level. Compare the fixture values, not only the case name. A regression can depend on one value (for example `null` compared to a string).
- **Navbar and layout specs.**

Tests that look covered often have a small gap: a link `href`, a tracking event, a tab switch, a `null` value, an icon, or URL navigation. Do the mapping. Do not assume that a test is covered.

## Step 3: Fill the gaps

Add to the spec that already exists for the component. Create a new spec only when there is no spec.

- Use the `setup` pattern of the spec. Add a named option. Do not add a second setup function.
- Get the fixture shape from the backend, not from the frontend type. If the e2e test stubs a value, find the backend code that makes it. If the frontend type does not allow that value, do not change the type. Use the nearest value that the type allows, and report the gap.
- Make the unit assertion stronger than the e2e one when you can. For example, assert an attribute value where the e2e test only asserted that an element exists.
- Tracking events: use `jest.requireMock("metabase/analytics")`, filter the `trackSchemaEvent` calls by schema and event, and assert the count and the payload.
- Navigation: render with `withRouter: true` and `initialRoute`. Use the returned `router` and assert `router?.location.pathname`.
- Error responses (S tests): copy the status and the body from the backend test. If the shared helper in `__support__/server-mocks` only sends a success response, add a named option with a default value. Do not change what the helper does for callers that do not use the option. Assert each message that comes from the response. A form can show both a field error and a message for the full form.
- Make the `setup` wait specific. If `setup` waits for a broad pattern, a mutation can make the test fail in `setup` and not in your assertion. Wait for one unique element.

### Mantine gotchas in jsdom

- `Tabs` removes inactive panels from the DOM. Use `queryBy...` with `not.toBeInTheDocument()`. Do not use `not.toBeVisible()`.
- `NavLink` and `Collapse` children stay `display: none` for a short time after you expand them. Use `findByRole`. If you use `getByRole`, it fails.

## Step 4: Prove that the test can fail

Change the source temporarily, run the test, then restore the source:

```bash
sed -i 's/<line that the test depends on>/<broken line>/' path/to/Component.tsx
bunx jest --silent path/to/Component.unit.spec.tsx -t "test name"   # must FAIL
git checkout path/to/Component.tsx
```

- The test must fail **at the assertion that you added**, not in `setup` or at an earlier line. Read the failure location.
- For `it.each` tables, it is sufficient if one row is positive and one is negative and both rows use the same query.
- For S tests, change the text in the mocked response. The test must fail. This shows that the UI shows the response, and not static text that has the same words.
- Always restore the source. Do not leave a mutation in the working tree.

## Step 5: Delete the e2e tests and verify

1. Delete the migrated `it()` blocks. Also delete `describe` blocks that become empty, and `beforeEach` lines that only the deleted tests used.
2. Do not change imports that the remaining tests still use. Do not edit `e2e/support/timings.json`.
3. Fix convention problems in the e2e tests that you keep, in the same change. Do Step 1b on a test before you fix it. A test that you fix and then delete is wasted work. Check them against `.claude/skills/_shared/cypress-conventions.md`. Common problems:
   - A raw `cy.visit()` chain followed by clicks, where a helper does the same thing (`H.visitQuestion(id)`, or `{ visitQuestion: true }` on `H.createQuestion`).
   - `.get()` chained on a subject. `.get()` always searches the whole document. Use `.find()` to search in the subject.
   - An assertion of absence placed before an assertion that waits for content (see [Negative assertions that pass without proof](#negative-assertions-that-pass-without-proof)). Move it after the positive assertions.
4. Run the unit specs that you changed, and the specs that you cited:
   `bunx jest --silent <paths...>`
5. Run `bun run type-check-pure`. If it fails with no file location (for example `TS2589: Type instantiation is excessively deep`), find the file with `git stash push <file>`, one file at a time. Generic mock factories can cause this error when you give them a union key or a conditional value. Give them a literal key.
6. Do not run ESLint. The pre-commit hooks run oxlint.

## Step 6: Report

Write the report to `local/claude/<spec-name>-e2e-to-unit.md`. Include:

- A table with all tests: bucket, reason, and action (migrated or kept).
- For each migrated test: each assertion → unit `file:line`, and the tests that you added.
- E2e assertions that the probe showed to be incorrect.
- Bugs in production code, and gaps between the frontend types and what the backend sends. Report them only. Do not fix them.
- The before and after count of e2e tests.

## Step 7: PR description

When the PR is open, write its description to a local file: `local/claude/pr-<branch>.md`. Do not post it.

- Write each paragraph and each bullet as one line. Do not break lines inside a sentence.
- Start with a short summary for human reviewers: how many e2e tests you deleted and why, which unit specs you added or extended, and the e2e assertions that the probe showed to be incorrect.
- Put the evidence in a collapsible block at the end: the table of each e2e assertion → unit `file:line` and backend `file:line`.

```html
<details>
<summary>Coverage evidence</summary>

| e2e test | Assertion | Covered by |
|---|---|---|
| ... | ... | `path/to/spec.tsx:42` |

</details>
```

- Do not repeat the full report. Do not include session history (what you tried first, or what a reviewer corrected).

## Practical notes

- **Do the classification yourself.** One read of a large spec is fast. Use subagents only for the grep for coverage across many specs.
- **Limit the time for each investigation.** If you cannot explain an assertion after about 3 lookups, stop reading and write a probe.
- **Make Jest output short.** A failure prints the full DOM. Use `--silent` and `-t`. If the output is saved to a file, grep it for `✓|✕|Tests:`.
- **CI history** shows whether a test passes. It does not explain behavior.
- **Check paths before you start.** The target in the request can be a single spec file and not a folder.
