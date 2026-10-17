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
- the CI seconds the removed tests cost, from `timings.json`.

## What NOT to do

- Do not migrate bucket 1 or 2 tests. Narrowing an over-split e2e test is a separate change.
- Do not rewrite the e2e tests that stay. Only remove what moved.
- Do not keep both tests. A moved test exists in exactly one place.
- Do not reach for Cypress component tests (`e2e/test-component`) unless the test needs a real browser and no backend. Jest is the default.
- Do not convert `.cy.spec.js` files to `.ts` as a side effect.
- Do not invent selectors. Every query in the unit test must come from the component source or the e2e spec you are replacing.
