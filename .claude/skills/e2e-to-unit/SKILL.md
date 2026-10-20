---
name: e2e-to-unit
description: Triage a Cypress e2e spec into keep, narrow and move buckets, move the coverage of the "move" tests to Jest unit tests, delete those e2e tests, and prove with aimed breaks that no behavior lost its protection. Use when asked to move e2e tests to unit tests, cut e2e cost, or decide whether a test belongs in e2e.
disable-model-invocation: true
allowed-tools: Read, Grep, Glob, Bash, Edit, Write, Agent, Skill
---

# E2E to unit test migration

This skill moves e2e coverage to Jest without loss. A migration must keep or increase coverage. A regression that a deleted e2e test would have caught is a failure of this skill.

## Input

The user gives one spec path, and optionally a list of candidate tests in that spec. One spec file is the unit of work: one spec for each run, branch and PR. Never take a folder or a list of specs. If the user gives a folder, ask which spec. The list can come from any source. Treat it as candidates, not as verdicts: triage still classifies each test. With no list, triage each test in the spec.

## Flow

```
triage ──► migrate ──► verify ──► all rows caught ──► ready for review
                         │
                         └─ open rows ──► migrate (fix) ──► re-run those breaks
                                                              │
                                              still open ──► restore the e2e test
```

- **Triage** classifies the tests. The user approves the rows.
- **Migrate** moves the tests quickly. It maps and cites coverage, but it does not prove it.
- **Verify** proves each deletion once, with aimed breaks, in a fresh agent. It is the only proof step, and it finds what migrate missed.
- **Migrate (fix)** takes only the open rows from verify as input, and closes them.
- **Re-run** applies only the breaks of the fixed rows again. It needs no new reasoning. A row that is still open gets its e2e test back.

The loop runs one time. The PR is ready for review only when no row is open.

```
/e2e-to-unit triage  e2e/test/scenarios/<area>/<spec>.cy.spec.ts ["<it title>" ...]
/e2e-to-unit migrate e2e/test/scenarios/<area>/<spec>.cy.spec.ts ["<it title>" ...]
/e2e-to-unit verify  [--base <ref>]
```

With no mode, run triage. With `migrate` and no titles, migrate each test that the approved triage put in a move bucket. `migrate` always continues with `verify` and the loop.

Before you edit a test file, load **typescript-write**. Read `frontend/CLAUDE.md` for the unit test setup and the server-mock helpers.

## Hard rules

- Do not run Cypress locally. Classify each test by reading its source. CI runs the e2e specs that remain.
- Change test files and test support only (`*.unit.spec.*`, `frontend/test/__support__/`, the e2e spec). Do not change production source or types without explicit approval, also when you find a bug. Report the bug and wait. A product rule stated in chat is not approval, and it can be wrong. Breaks in verify are temporary and are always restored.
- Each deleted e2e test needs a **caught** result in verify for each of its assertions, explicit and implicit (see [Step 1](#step-1-map-each-assertion)). A file name, a test title or a citation is not proof. If the loop cannot prove a deletion, restore the e2e test.
- Classification must be strict. Verify runs Jest, so it cannot see that a true e2e test (C) was deleted by mistake. Do not delete a C test.
- The bucket comes from what the test **does**, not from how well you understand the source. If an assertion does not agree with the source, do not keep the test because of that. [Probe](#probe-with-a-unit-render) the real behavior.
- Keep the scope to the spec that you were given. Do not move tests into other e2e specs. Do not rewrite e2e tests that stay, except to fix an assertion that proves nothing (see [Negative assertions](#negative-assertions-that-pass-without-proof)).
- A moved test exists in one place only. Do not keep both the e2e test and the unit test.
- Tooling files must not go under `e2e/`. Each non-spec file there starts a full e2e run in CI (`e2e_infra` in `.github/file-paths.yaml`).

## The decision rule

@./../_shared/e2e-vs-unit.md

Put each test in one bucket:

| Bucket | Meaning | Action |
|---|---|---|
| **A: Fully mocked** | `cy.intercept(..., { body })`, `req.reply(...)` or a fixture stubs the data that the test asserts on. The real backend only serves the page. | Move (pass 1) |
| **B: Render-only** | The test visits a page, or seeds state through the API, and then asserts on the UI. No action has an effect that goes through the backend. Clicks that only navigate or open UI are still B. | Move (pass 1) |
| **S: Contract seam** | A UI action sends a request, and the test checks how the UI shows the response. A backend test already pins that response. | Move the UI half (pass 2) |
| **N: Narrow** | True e2e, but over-split or doing more boots than the coverage needs. | Record it. Do not change it here. |
| **C: True e2e** | The value comes from the integration. | Keep |

A test that a signal for e2e keeps, but only because a backend test does not pin the data or the response, is S when that backend test exists. A low issue priority can change the order of work. It must not change the standard of proof.

## Passes

| Pass | Scope | Verify |
|---|---|---|
| 1 | A and B tests. This is the default. | Light: read helpers only where a step needs them, at most 5 gap breaks, frontend only. |
| 2 | S tests. Only when the user asks, or when the spec is slow or flaky. | Full: read each helper and hook, at most 10 gap breaks, backend breaks permitted. |
| — | C and N tests | Do not touch. |

Do one PR for each spec. Do not group specs, also when they are in the same folder.

## Mode: triage

1. Read the full spec before you judge a test, also when the user gave a list of candidates. Note the shared `before` and `beforeEach`: the snapshot that they restore, the token that they activate, and what they create through `cy.request`.
2. For each candidate `it()` (or each `it()` when there is no list), write the layers that it touches and its bucket, with a one-line reason. If your bucket does not agree with the reason given in the input, write both.
3. For each move candidate that references an issue (`metabase#NNNNN`, `(#NNNNN)`), find the fix. Verify uses it as a break.
   `gh issue view NNNNN --repo metabase/metabase --json title,body,closedByPullRequestsReferences`
   `gh pr diff <fix PR> --repo metabase/metabase --name-only`
   Read the issue title, the steps to reproduce, and the diff of the product files only. Do not read the comment thread. If the fix changes frontend and backend code, the test is probably S or C.
4. For each move candidate, find the target unit spec. Grep `frontend/src` and `enterprise/frontend/src` for the `data-testid`, aria label or visible text that the test anchors on. The component that owns the anchor is the subject. Prefer the smallest component whose props or store state hold the behavior. Then:
   `bunx jest --listTests --findRelatedTests <component file>`
   If a case there already asserts the same thing, write "possibly covered". Triage does not delete.
5. Get the cost from `e2e/support/timings.json` (key `../test/scenarios/<path>`, milliseconds for each full spec pass). Divide by the number of `it()` blocks for a rough cost for each test.
6. Write one table:

| # | `it()` title (line) | Bucket | Layers touched | Issue / fix PR | Target unit spec | Existing coverage |
|---|---|---|---|---|---|---|

Then write how many tests stay, how many move, and the CI seconds that the move bucket costs.

**Stop after the table.** The user approves or rejects the rows. Do not start `migrate` in the same turn.

## Mode: migrate

Work fast. Map, write, delete. Do not prove: verify does that one time for all tests.

### Step 1: Map each assertion

Make a table: e2e assertion → unit or backend `file:line` → **covered**, **partial** or **gap**. Verify uses this table as the list of claims to check.

List the **implicit** assertions too. They are easy to lose:

- **`cy.wait("@alias")`** with `.its("request.body")`, a status check, or a `.should(...)` on the interception: these prove that the app sent a request with a given shape. The unit test must assert the request body with `findRequests` from `__support__/server-mocks`.
- **Setup and helpers.** A step in a helper or in `beforeEach` (a visit to a route, a token, a setting) is part of what the test proves.
- **Preconditions.** Compare plan, hosting, edition, user role and setting values, not only the case name. A regression can depend on one value (for example `null` compared to a string). When the e2e test ran with `H.activateToken`, the unit test must use the same token features (`setupEnterprisePlugins` or `setupEnterpriseOnlyPlugin` from `__support__/enterprise`). A test tagged `@OSS` needs an OSS render.

Look for coverage that is easy to miss: route-level harnesses (often one spec for each edition), component and page specs, navbar and layout specs. Tests that look covered often have a small gap: a link `href`, a tracking event, a tab switch, a `null` value, an icon, a URL.

### Step 1b: Contract seam (pass 2 only)

1. Find the endpoint that the UI action calls, and its backend test:
   `rg -n "<endpoint path>" test/ enterprise/backend/test/`
2. Find the case that makes the same response: the same status, and the same body or `:errors` shape. Note the `file:line`.
3. If it exists, the backend half is covered. Move the UI half: mock the same status and body, and assert what the user sees.
4. If it does not exist, the test stays in C. Report the missing backend test. Do not write it: backend tests need reviewers from other teams. Add one only with explicit approval.

When in doubt, keep a short e2e test for the round trip and move the rest to Jest.

### Step 2: Fill the gaps

Add to the spec that already exists for the component. Create a new spec only when there is no spec.

- Read the component, its spec and one sibling spec in the same folder. Use the `setup` of the spec. Add a named option. Do not add a second setup function.
- Use the standard harness: `renderWithProviders` from `__support__/ui`, `setup*Endpoints` from `__support__/server-mocks` (do not write raw `fetchMock` routes when a helper exists), and `createMock*` factories from `metabase-types/api/mocks`.
- Carry the issue number from the e2e title into the new `it()` title or `describe`. If a regression test loses its issue number, someone can delete it later as unexplained.
- Assert what the e2e test saw: text, role, aria state, a request body, or the URL. Make the assertion stronger when you can (an attribute value where the e2e test only checked that an element exists).
- Get the fixture shape from the backend, not from the frontend type. If the frontend type does not allow a value that the backend sends, do not change the type. Use the nearest allowed value, and report the gap.
- Error responses (S): copy the status and the body from the backend test. If a `__support__/server-mocks` helper only sends a success, add a named option with a default value. Do not change what the helper does for callers that do not use the option.
- Tracking events: do not import from `metabase/analytics` in a spec (the lint rule forbids it, also for `import type`). Use `jest.requireMock<{ trackSimpleEvent: jest.Mock }>("metabase/analytics")` (or `trackSchemaEvent`), filter the calls by event, and assert the count and the payload.
- Navigation: render with `withRouter: true` and `initialRoute`, and assert `router?.location.pathname`.
- Make the `setup` wait specific. Wait for one unique element, so that a break fails at your assertion and not in `setup`.
- Do not use snapshot tests. Do not invent selectors: each query comes from the component source or the e2e spec.

### Step 3: Delete the e2e tests

1. Delete the moved `it()` blocks, `describe` blocks that become empty, and `beforeEach` lines, helpers, constants and imports that only the deleted tests used. If the file becomes empty, delete it.
2. **The last e2e test for a page.** An e2e test also proves that the route exists, that the page mounts at that URL, and that it loads with the real API. Before you delete the last test that visits a route, search all specs: `rg -n "<route path>" e2e/test`. If no other spec visits it, keep one short smoke test of its most important round trip, or report the route as uncovered.
3. Do not edit `e2e/support/timings.json`. A scheduled job regenerates it.
4. Do not convert `.cy.spec.js` files to TypeScript as a side effect.

### Step 4: Check and commit

1. Run the unit specs that you changed and the specs that you cited: `bunx jest --silent <paths...>`. All must pass. Call Jest directly. `bun run test-unit-keep-cljs <path>` runs the full suite, because `--ignoreProjects` takes the path as one of its values. If Jest cannot find `metabase-lib` or cljs output, run `bun run build:cljs` once.
2. Run `bun run type-check-pure`. If it fails with no file location (for example `TS2589: Type instantiation is excessively deep`), find the file with `git stash push <file>`, one file at a time. Generic mock factories can cause this when you give them a union key. Give them a literal key.
3. Do not run ESLint. The pre-commit hook runs oxlint.
4. Before each commit, run `git status --short` and `git diff --cached --name-only`. Stage explicit paths, never `git commit -a`. Only test files, test support and the e2e spec can be staged. A modified production file means that a break is still applied. Do not commit while other agents run tests: the pre-commit hook stashes unstaged changes for a short time.
5. Use one commit for each test, or for each group that shares a target spec. Do not put an issue key in a commit message.

### Migrate (fix)

The input is the open rows from verify, and nothing else. Do not triage again, and do not map the other rows again. For each open row:

- Add or change a unit test so that it catches the break of that row. The row gives the deleted test, the break, and the file and line.
- Or name a kept e2e test that takes the same step, with `file:line`.
- Or, if the break does not run on the deleted test's path, write that beside the row with the reason.
- Or restore the e2e test.

Then run Step 4.

## Mode: verify

Verify is the only proof step. It checks the claims of migrate and finds what migrate missed. It runs in the same PR, before review.

If the `e2e-replacement-check` skill is available, use it for steps 1 to 5. Steps 6 and 7 stay the same.

1. **Use a fresh agent.** Start one subagent with the Agent tool. Give it the base ref, the deleted and shrunk tests, the mapping table from Step 1 (claims to check, not facts), the fix PRs from triage, and this section. Do not give it the reasoning of the session that wrote the tests. The subagent does not run tests.
2. **List the steps.** For each deleted test, read it at the merge base (`git show <base>:<spec>`). List each UI step and each assertion, explicit and implicit. For each step, find the product code that it drove. In pass 1, read a helper or hook only when a step or a precondition depends on it. In pass 2, read each helper and hook.
3. **Write claim breaks.** For each test in the mapping table, new or existing, write one break of the behavior that it claims to cover. Choose in this order:
   1. Revert the fix from the fix PR (tests that reference an issue). If the code moved, write the same break where the logic is now. This is the strongest proof.
   2. Change the product line that reads the input that the e2e test varied (a flag, a role, a token, a setting).
   3. Remove or change the line that makes the asserted behavior.

   For S tests, also change the text in the mocked response. This shows that the UI shows the response, not static text with the same words.
4. **Write gap breaks.** For each step that no claim covers, and for each shortfall below, write a break. Rank them by the most likely loss. Use at most 5 in pass 1 (frontend only), and at most 10 in pass 2 (backend permitted). The shortfalls are where the new test:
   - mocks what the e2e test ran for real;
   - covers one of several entry points to the behavior;
   - does not check the request shape or field that joins frontend and backend, and no backend test does;
   - does not render the component where the result shows;
   - covers fewer roles, permissions, editions or data variants;
   - drops a wait or readiness check that sat behind the action.
5. **Rules for each break.** Edit product code only, except the S response-text break. Make the smallest edit that would make the deleted test fail. Change a line that the deleted test's path runs: follow the code from the step to the line. For example, an `onClick` on a link whose component stops the click in `onClickCapture` never runs. Kinds:

   | Kind | What it does |
   |---|---|
   | `remove` | Deletes the code that makes the behavior (a toast call, a prop). |
   | `block` | Stops an action (an early `return`, `preventDefault()`). |
   | `wrong-value` | Makes the code produce the wrong thing (a URL, a flipped condition). |

6. **Run each break** (main agent). Apply it, run the PR's unit specs and `bunx jest --silent --findRelatedTests <changed file>` in one call, read only the result lines, then restore with `git checkout <file>`. A break is **caught** only if the failure is an assertion failure at the claimed test's assertion (not in `setup` or earlier), it occurs again on a rerun, and the test passes again on clean code. A timeout or an error thrown from product code is **unmeasured**, not caught. Always restore the source.
7. **Close the loop.** Each row that is "nothing failed" or "unmeasured" is open. Send the open rows to [Migrate (fix)](#migrate-fix), then apply only the breaks of those rows again. If a row is still open, restore its e2e test and write that in the report. Do not run the full verify again.

## Report and PR description

Write the report to `local/claude/<spec-name>-e2e-to-unit.md` and the PR description to `local/claude/pr-<branch>.md`. Do not post them. Write each paragraph and bullet as one line.

The PR description has:

- A short summary for reviewers: how many e2e tests were deleted and why, which unit specs were added or extended, how many rows the fix pass closed, which e2e tests were restored, the CI seconds that the deleted tests cost (`timings.json`), the tokens used, and e2e assertions that the probe showed to be incorrect.
- Bugs in production code, and gaps between frontend types and backend responses. Report them only.
- The verify table and the coverage table:

```html
<details>
<summary>Verify: aimed breaks</summary>

| Deleted e2e test | Break | Result |
|---|---|---|
| ... | ... (`File.tsx:42`) | caught: `Spec › test` |

</details>

<details>
<summary>Coverage evidence</summary>

| e2e test | Assertion | Covered by |
|---|---|---|
| ... | ... | `path/to/spec.tsx:42` |

</details>
```

Do not include session history (what you tried first, or what a reviewer corrected).

## Cost rules

Tokens are expensive. CPU is cheap. Prove one time, in verify, with test runs. Do not prove in migrate.

- **Do the classification yourself.** One read of a large spec is fast.
- **Agents for search only.** One spec is usually small enough to search yourself. Use an agent only for a large search, never one for each test, and at most 4 at a time. Use a cheaper model through the Agent tool's `model` parameter (`sonnet`, or `haiku` for pure grep and read). Give each agent the exact paths and the facts that you already know. Require a report under about 300 words, with `file:line` citations. A search result is a claim. Verify proves it.
- **Limit each investigation.** If you cannot explain an assertion after about 3 lookups, stop reading and write a probe. This also applies to subagents.
- **Make Jest output short.** Use `--silent` and `-t`. If the output goes to a file, grep it for `✓|✕|Tests:`.
- **Record the tokens** for each spec in the report, from the agent usage notifications. Record how many rows verify opened and how many the fix pass closed.

## Reference

### Probe with a unit render

When the source does not explain an assertion, add a temporary test to the spec that is closest to the component:

```tsx
it("PROBE", async () => {
  await setup({ /* the state of the e2e test */ });
  screen.debug(undefined, 100000);
});
```

Run it with `-t PROBE`, read the DOM, then replace the probe with a real test.

### Partial intercepts

`cy.intercept(url, (req) => req.continue((res) => { res.body.x = ... }))` changes only part of a real response. Do not try to work out the full state from the source for a long time. Find the inputs from the backend, then render that state in a probe. Check which endpoint each hook really calls: a hook can be an alias of a hook for a different endpoint.

### Negative assertions that pass without proof

An assertion of absence immediately after `cy.visit`, before an assertion that waits for content, can pass while the page loads. It proves nothing. Do not copy it to the unit test. Assert the real behavior that the probe shows, and report the incorrect e2e assertion. In an e2e test that stays, move the absence check after the positive assertions.

### Mantine in jsdom

- `Tabs` removes inactive panels from the DOM. Use `queryBy...` with `not.toBeInTheDocument()`, not `not.toBeVisible()`.
- `NavLink` and `Collapse` children stay `display: none` for a short time after they expand. Use `findByRole`, not `getByRole`.
