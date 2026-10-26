---
name: e2e-to-unit
description: >
  Triage a Cypress E2E spec into keep / narrow / move buckets, then migrate the
  "move" it() blocks into Jest + RTL unit specs and delete them from e2e. Use
  when asked to move e2e tests to unit tests, cut e2e cost, or decide whether a
  test belongs in e2e at all.
disable-model-invocation: true
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
  - Grep
  - Glob
  - Skill
---

# Move E2E tests to unit tests (Metabase)

Two modes. Run triage first, every time. Migrate only what triage put in bucket 3.

```
/e2e-to-unit triage e2e/test/scenarios/<area>/<spec>.cy.spec.ts
/e2e-to-unit migrate e2e/test/scenarios/<area>/<spec>.cy.spec.ts ["<it title>" ...]
```

With no mode given, run triage. With `migrate` and no titles, migrate every bucket-3 `it()`.

## The decision rule

@./../_shared/e2e-vs-unit.md

The three buckets:

1. **Keep**: load-bearing e2e. Name the layer only a browser plus backend can verify.
2. **Narrow**: justified as integration, but over-split or booting more than the coverage needs. Out of scope for this skill. Note it and move on.
3. **Move**: the real subject is frontend-only. Name the unit layer and what it asserts.

Do not inflate the keep bucket to look balanced. A spec where every `it()` must stay e2e is a legitimate outcome, and so is one where every `it()` moves.

## Mode: triage

1. Read the whole spec end to end before judging any `it()`. Note the shared `beforeEach`: what it restores, which snapshot, what it creates through `cy.request`.
2. For each `it()`, write down the layers it touches:
   - Does any assertion depend on rows the backend computed? A `cy.intercept` that only **waits** on a request is not a mock. A `cy.intercept` that **stubs** a body means the backend is already faked.
   - Does it click at coordinates, drag, or hit-test rendered chart output?
   - Does it navigate across screens or depend on the URL round-trip being honored by the server?
   - Does it only read the DOM after a known API response and assert on text, visibility, aria state, or a querystring?
   - Which edition, token feature, or non-default setting does the `beforeEach` put it under? `H.activateToken`, `H.updateSetting` and a non-admin login are inputs the unit test has to reproduce, not harness detail. Write them in the Why column.
3. For each bucket-3 candidate, find the home of the unit test:
   - Grep `frontend/src` and `enterprise/frontend/src` for the `data-testid`, aria label, or visible text the e2e test anchors on. The component that owns the anchor is the subject.
   - Prefer the smallest component whose props or store state contain the behavior.
   - Check for an existing `*.unit.spec.tsx` next to it. If a case there already asserts the same thing, the bucket is **already covered**: the e2e `it()` can be deleted without writing anything.
4. Pull the spec's CI time from `e2e/support/timings.json` (key is `../test/scenarios/<path>`). Divide by the `it()` count for a rough per-test cost.
5. Report one table, one row per `it()`:

| # | `it()` title (line) | Bucket | Why (layers touched) | Target unit file | Existing coverage |
|---|---|---|---|---|---|

Then a bottom line: how many `it()` blocks stay, how many move, which ones are already covered, and roughly how many CI seconds the move bucket costs today.

Do not start migrating in triage mode. Stop after the table so the user can veto rows.

## Mode: migrate

Work one `it()` at a time, or one group that shares a target unit file. For each:

### 1. Read before writing

- Read the target component and its existing unit spec, if any. Match its setup helpers exactly. Extend an existing `describe` rather than creating a parallel file.
- Read one sibling unit spec in the same directory for the local idiom.
- Standard harness, in this order of preference:
  - `renderWithProviders` from `__support__/ui`, with `withRouter: true` and `initialRoute` only when the component reads route state;
  - `setup*Endpoints` from `__support__/server-mocks` for every request the component makes. Do not hand-write `fetchMock` routes when a `setup*` helper exists;
  - `createMock*` factories from `metabase-types/api/mocks` and the `createSampleDatabase` preset;
  - `setupEnterprise*` from `__support__/enterprise` when the e2e test ran with `H.activateToken`.

### 2. Keep the server half

If any assertion in the e2e `it()` depended on a server decision (permissions, `can_upload`, computed field values, query results), do not drop it:

- Grep `test/` and `enterprise/backend/test/` for an existing Clojure test of that decision.
- If none exists, add one and run it with `./bin/test-agent :only '[the.ns-test/the-test]'`.
- Prove the test you cite pins the decision. Break the thing it is supposed to protect and watch it go red, the same way you break a unit test. A test that derives both sides of its comparison from one source pins nothing: `session/api-test/properties-test` compares the settings endpoint's keys against the same registry the endpoint reads, so changing a setting's `:visibility` moves both sides together and it stays green. Citing a test like that in the PR is worse than citing none, because it closes the question.

The unit test then asserts the frontend's reaction to that decision through a mocked response.

### 3. Write the unit test

- Carry the issue number from the e2e title into the new `it()` title or `describe`.
- Assert the same observable the e2e test asserted: visible text, role, aria state, or the URL. Do not assert on implementation details the e2e test never saw.
- One `it()` in e2e usually becomes one `it()` in Jest. Do not pad.
- No snapshot tests.

### 4. Run it, then prove it is not vacuous

```bash
./node_modules/.bin/jest <path-to-unit-spec>
```

Call jest directly. `bun run test-unit-keep-cljs <path>` runs the whole suite, because the script's `--ignoreProjects` flag takes a list and swallows the path.

If the run fails on missing `metabase-lib` or cljs output, run `bun run build:cljs` once and retry.

Then invert the input the e2e test varied (flip the mocked flag, remove the mocked item, change the role) and run again. The test must fail. Restore the input. A unit test that passes both ways did not move any coverage.

Invert the input the **e2e test set**, not the one your fixture happened to default to. If the e2e ran under a token, a renamed application, a non-default setting or a non-admin user, the unit test has to set the same thing, otherwise there is no input to invert and the product could hardcode the default and stay green. A replacement that asserts `About Metabase` does not cover an e2e test that asserted `About New Test Co`.

Inverting one input proves that test is not vacuous. It does not prove the branch kept the coverage it deleted. Run `verify.ts` for that, and read its rows by the rules in [Reading the verify report](#reading-the-verify-report).

### 5. Delete the e2e `it()`

- Remove the `it()` block.
- If its `describe` is now empty, remove the `describe`. If the file is now empty, delete the file.
- Remove helpers, constants, and imports in the spec that only that `it()` used. Do not touch anything other tests still use.
- Do not edit `e2e/support/timings.json`. A workflow regenerates it.
- Only re-run the e2e spec when you changed shared setup (`before`, `beforeEach`, a shared helper). Use the `/e2e-test` skill for that, never `bun test-cypress` directly.

### 6. Type-check and commit

```bash
bun run type-check-pure
```

One commit per `it()`, or per group sharing a target file. Title: `Replace <thing> e2e test with a unit test`. Mention the issue number when there is one.

### 7. PR description

Describe the end state, in this shape:

- which e2e `it()` blocks were removed and from which spec;
- which layer the e2e test was actually exercising, and why that layer does not need a browser;
- what the new unit test asserts, and which backend test covers the server half if there was one;
- the CI seconds the removed tests cost, from `timings.json`;
- every open row from `verify.ts` that you did not act on, with which of the three reasons applies;
- the three questions in [What the report cannot see](#what-the-report-cannot-see), each with the test that answers it. A clean report is not an answer to any of them.

## Reading the verify report

`verify.ts` reports one row per product function: see [VERIFY.md](VERIFY.md). The rows are evidence, not a verdict on the branch. A green row is the one that misleads, so read them in this order.

1. **A verdict is only as strong as the mutant behind it.** Read what the mutant changed before you trust `caught`. One mutant that stands for a whole contract is closed by one assertion. A function that returns six things, or renders six children, needs a mutant for each of them.
2. **Close a `survived` row by rerunning, not by reasoning.** Write the assertions, run the verifier again, and require that row to read `caught`. A row you argue away is still open.
3. **Record every row you do not act on.** Put it in the PR under one of three headings: covered by a named test, not introduced by this branch and still missing, or an equivalent mutant that no assertion can notice. Say which one. Never drop a row in silence.
4. **`unmeasured` is not `caught`.** It says the run reached no verdict. Treat it as open.
5. **Judge the run before you read the rows.** Count `over --max-mutants`, `excluded`, and the size of the confirm pass. A run that could not reach the code proves nothing about that code.

### What the report cannot see

A function with no row is not a function with no risk. Three classes never reach the report at all, and they are exactly where a migration breaks:

1. **Boot functions.** Anything 20% or more of the e2e suite fires is dropped from scope. Shared selectors and plugin initialization live there. `getApplicationName` and `initializePlugin` have never appeared in a report.
2. **Code that is not TypeScript.** A Clojure setting's `:visibility`, a validation message, a status code. The runner mutates TS and runs Jest, so none of it exists for the tool.
3. **Constructs with no mutant.** The kinds cover returns, branches, JSX and calls. An assignment statement has none, so `PLUGIN_SELECTORS.x = y`, and every other plugin slot registration, is invisible.

One more class produces a row that lies: **a fixture that never varies the input**. Mutation asks whether an assertion notices a change in behavior. It cannot ask whether your fixture is interesting. A spec rendered with the default application name cannot be killed by any mutant on the whitelabel name path, because every mutant yields the same string.

So a clean report does not close these three questions. Answer them by hand, per moved test:

- **Which flag, edition, setting or role did the e2e test vary?** Your unit test must vary the same one. See [step 4](#4-run-it-then-prove-it-is-not-vacuous).
- **Which plugin slot did the behavior cross?** If the e2e ran with `H.activateToken`, something registered a slot in an `index.ts`. Some unit test must call `setupEnterpriseOnlyPlugin` and assert through the real slot. A `jest.spyOn` over that slot replaces the seam you are trying to cover, so it can never fail for the right reason.
- **Does the backend test you cited fail when you change the thing?** See [step 2](#2-keep-the-server-half).

### Worked example: three gaps behind a clean report

The whitelabel migration came back with no row claiming lost coverage, and the illustration wiring came back `caught` through the real plugin slots. A reviewer still found three gaps, one per class above:

- The replacement for `About <app>` asserted `About Metabase` with no application name set, so `AppSwitcher.tsx` could hardcode that string and stay green. `getApplicationName` is boot-filtered and had no row to read.
- "The logo shows while signed out" was credited to a backend test that cannot fail for that reason. The real assertion is one line on the setting's `:visibility`.
- Four of five whitelabel plugin slots were covered by accident, because the illustration specs initialize the plugin. The loading message slot was not, and no mutant reaches an assignment, so nothing said so. The tell was a row that was absent, not a row that was red.

Read the report for which functions are missing from it, not only for which rows are green.

### Worked example: a coarse mutant

`SecurityCenterPage.unit.spec.tsx` replaces the hook `useSecurityAdvisories` with a stub, so the hook lost its coverage when the e2e tests went. A new spec asserted `data` and `lastCheckedAt`, and the row turned `caught`.

The hook returns six things. Its only mutant at the time was `return undefined` for the whole object, which an assertion on any one property satisfies. `acknowledgeAdvisory` and `acknowledgeAdvisories` stayed unprotected, and a reviewer found them by reading the diff. The runner now writes one mutant per returned property. The rule outlives the fix: a coarse mutant makes a partial test look complete.

## What NOT to do

- Do not migrate bucket 1 or 2 tests. Narrowing an over-split e2e test is a separate change.
- Do not rewrite the e2e tests that stay. Only remove what moved.
- Do not keep both tests. A moved test exists in exactly one place.
- Do not reach for Cypress component tests (`e2e/test-component`) unless the test needs a real browser and no backend. Jest is the default.
- Do not convert `.cy.spec.js` files to `.ts` as a side effect.
- Do not invent selectors. Every query in the unit test must come from the component source or the e2e spec you are replacing.
