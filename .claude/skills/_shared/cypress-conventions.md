# Metabase Cypress Conventions

These conventions apply when writing **and** reviewing Cypress E2E specs in `e2e/test/scenarios/`.

For framework-level guidance, the canonical source is the official Cypress best practices page: <https://docs.cypress.io/app/core-concepts/best-practices>. Specific rules from that page are folded in below as we encounter them; the page itself is the authoritative reference for anything not covered here.

## File location and naming

- Place specs in `e2e/test/scenarios/<area>/`, mirroring the URL structure.
- Extension: `.cy.spec.ts` is preferred for new specs. `.cy.spec.js` is also valid — a large portion of the codebase still uses it. Don't convert existing `.js` specs as a side-effect of unrelated work.
- `describe` block name follows the pattern: `"area > sub-area > feature (#issue-number)"` when the spec ties to a tracked issue.

## Helpers

All helpers are accessed via `const { H } = cy;` — NEVER via direct imports from `e2e/support/helpers`.

```js
const { H } = cy;

describe("feature name", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });
});
```

Use existing navigation helpers (`H.openOrdersTable()`, `H.openNativeEditor()`, `H.visitDashboard(id)`, `H.visitQuestion(id)`, etc.) instead of raw `cy.visit()` chains. Grep `e2e/support/helpers/` to discover what's available.

## Constants and IDs

**Sample Database schema** (table/field definitions) — import from `cypress_sample_database`:

```js
import { ORDERS, ORDERS_ID, PRODUCTS } from "e2e/support/cypress_sample_database";
```

**Instance data** (dashboard IDs, user IDs, etc.) — import from `cypress_sample_instance_data`:

```js
import { ORDERS_DASHBOARD_ID } from "e2e/support/cypress_sample_instance_data";
```

**Never hardcode numeric IDs in tests — period.** Not even for entities the test creates itself. Auto-incrementing PKs are not stable: another test or seed step earlier in the run can shift "the next ID" from 10 to 11. Always capture the ID from the create response and reuse the captured value:

```js
// Good — capture and reuse
H.createDashboard({ name: "My dashboard" }).then(({ body: dashboard }) => {
  cy.visit(`/dashboard/${dashboard.id}`);
});

// Good — alias the intercept and pull the id off the response
cy.intercept("POST", "/api/dashboard").as("createDashboard");
// ...trigger creation...
cy.wait("@createDashboard").its("response.body.id").then((id) => { ... });
```

```js
// Bad — `10` is whatever auto-increment happened to land on at the time
cy.visit("/dashboard/10");
```

## Selectors (priority order)

1. **A11y-respecting queries**: `cy.findByRole()` / `cy.findByLabelText()` — from `@testing-library/cypress`. Prefer these whenever the element has an accessible role or label; they catch a11y regressions as a side-effect.
2. `cy.findByText()` — also from `@testing-library/cypress`. Use when an a11y query doesn't fit but the element has stable visible text.
3. `cy.findByTestId()` — for `data-testid` attributes.
4. Other `data-*` attributes as a fallback (e.g. `cy.get("[data-element-id='foo']")`) when a stable `data-testid` isn't available.

NEVER use:
- `cy.get("[data-testid='...']")` — always use `cy.findByTestId(...)` instead.
- CSS class names (especially generated ones from styled-components or Mantine).
- Ad-hoc CSS attribute selectors (`path[fill="..."]`, `[stroke="..."]`, etc.) in test specs or new helpers.
- XPath expressions.

### Visualization tests — the ECharts exception

`e2e/support/helpers/e2e-visual-tests-helpers.js` is the **only** file allowed to reach into rendered chart DOM via raw CSS attribute selectors. ECharts renders SVG with no `data-testid` attributes and minimal a11y surface, so there's no first-class alternative for asserting on chart visuals. The helpers there (`echartsContainer`, `goalLine`, `chartPathWithFillColor`, `pieSliceWithColor`, `cartesianChartCircle`, `BoxPlot.*`, etc.) are the intentional exception.

When writing or reviewing visualization tests:
- Always go through these helpers — don't roll your own `cy.get("path[fill=...]")` inline.
- If a chart pattern isn't covered, add a new helper to that file rather than embedding the selector in a spec.

### Positional selectors — use with care

`.eq(N)`, `.first()`, `.last()`, `:nth-child(N)` are sometimes the most readable option (e.g. tabular data where rows are intentionally ordered, or asserting on sort order itself). They aren't banned outright, but they're a flakiness risk if the collection size isn't locked. Use them only when:

- The order is part of the assertion itself (e.g. testing a sort), or
- A length assertion immediately precedes them, e.g. `.should("have.length", n).eq(0)`.

The `metabase/no-unsafe-element-filtering` lint rule already flags `.last()` and `.eq(<negative-index>)` when not preceded by a length assertion. `.first()` and non-negative `.eq(N)` aren't lint-checked, so the same caution falls on the author/reviewer.

### Text selectors must be scoped

Top-level `cy.findByText(...)` or `cy.contains(...)` inside an `it` / `before` / `beforeEach` matches against the entire document, which is a classic false-match and flakiness vector — any unrelated copy that contains the same string can hijack the assertion. Scope text-based selectors to a container:

- `cy.contains("[role='dialog']", "Save")` — two-argument form with a scoping selector
- `cy.findByRole("dialog").findByText("Save")` — chain off a scoping query
- `cy.findByRole("dialog").within(() => { ... })` — use `within` when **multiple** commands need to share the scope (see the next rule)

**`within` must ALWAYS be chained off an existing selector** — `someSelector().within(() => { ... })`. A bare `cy.within(...)` has no scope, defeats the entire purpose of `within`, and is wrong by construction. Flag every standalone `cy.within(...)` on sight.

**Don't reach for `within` when a chain would do.** If the callback contains a single command, just chain it off the parent directly — the `within` adds noise and gains nothing. Reserve `within` for when there are two or more inner commands that genuinely benefit from a shared scope.

```js
// Bad — single-statement within is just ceremony around a chain
cy.findByRole("dialog").within(() => {
  cy.findByText("Save").click();
});

// Good — chain directly
cy.findByRole("dialog").findByText("Save").click();

// Good — within earns its keep when multiple commands share the scope
cy.findByRole("dialog").within(() => {
  cy.findByLabelText("Name").type("Hello");
  cy.findByLabelText("Description").type("world");
  cy.findByRole("button", { name: "Save" }).click();
});
```

**Don't name the within callback parameter.** `within` passes the jQuery-wrapped subject in, but the inner Cypress commands inherit the scope automatically — the parameter is never used at runtime, and naming it suggests to the reader that it's needed (it isn't). If you actually need the subject, that's what `.then()` is for, not `within`.

```js
// Bad — `modal` is unused; the .within() callback receives it but you don't need it
cy.findByTestId("save-question-modal").within((modal) => {
  cy.findByText("Save").click();
});

// Good
cy.findByTestId("save-question-modal").within(() => {
  cy.findByText("Save").click();
});

// If you actually need the jQuery subject, use .then() instead
cy.findByTestId("save-question-modal").then(($modal) => {
  expect($modal).to.have.attr("aria-modal", "true");
});
```

The `metabase/no-unscoped-text-selectors` lint rule enforces this for the top-level case **only**. Wrapping the query in a helper function evades the rule (the rule walks up to the nearest block, which is the helper's body — not the test block). The convention still applies inside helpers: a helper that calls `cy.findByText(...)` unscoped is just as flaky as the inline version, and the lint rule won't catch it.

## Setup: API over UI

- Use `cy.request()` or existing API helpers to set up state.
- Only drive the UI for the flow you're actually testing.

## Waits and timing

- **Never** use numeric `cy.wait(ms)`.
- For API timing: define `cy.intercept()` BEFORE the action that triggers the request, then `cy.wait("@alias")`.
- For DOM readiness: prefer `.should("be.visible")` — it asserts the element is rendered **and** visible to the user, which is the right proxy for "the UI is ready". `.should("exist")` only proves the node is in the DOM and is **not** a readiness check; reserve it for cases where you specifically need to assert presence without visibility (hidden inputs, off-screen / portal-detached nodes, etc.).

```js
cy.intercept("POST", "/api/dataset").as("dataset");
// ... trigger action ...
cy.wait("@dataset");
```

## Never assign return values from `cy.*` commands

`cy.*` commands are not synchronous — they enqueue work on Cypress's command queue and resolve asynchronously. Assigning the return value to a variable yields a *chainer*, not the underlying DOM element / string / response. Treating that variable as if it held the resolved value is one of the most common foot-guns in Cypress and a frequent source of "but my console.log printed something weird" confusion. See the [official anti-pattern doc](https://docs.cypress.io/app/core-concepts/best-practices#Assigning-Return-Values).

```js
// Bad — `button` is a chainer, NOT a DOM node
const button = cy.findByRole("button", { name: "Save" });
button.click();
// `text` is a chainer, NOT a string
const text = cy.findByTestId("title").invoke("text");
expect(text).to.equal("Hello"); // always fails
```

Use `.then()` to access the resolved value, or `.as()` + `cy.get("@alias")` to reference it later:

```js
// Good — work with the value inside .then()
cy.findByTestId("title")
  .invoke("text")
  .then((text) => {
    expect(text).to.equal("Hello");
  });

// Good — alias when you need to refer to the same element later in the test
cy.findByRole("button", { name: "Save" }).as("saveButton");
// ...other steps...
cy.get("@saveButton").should("be.disabled");
cy.get("@saveButton").click();
```

If you only need the element at the point of grabbing it, skip the alias entirely and chain — `.as()` + `cy.get("@alias")` only earns its keep when there's distance between the lookup and the use:

```js
cy.findByRole("button", { name: "Save" }).click();
```

If you want to **name** a query so it reads better at the call site, wrap it in a function — never in a `const`:

```js
// Bad — this is just the assigning-return-values trap with extra steps.
// `foo` is a one-shot chainer; using it later won't re-query, won't retry, and is
// almost certainly not what you intended.
const foo = cy.findByText("Foo");
foo.click();

// Good — each call to foo() enqueues a fresh query with full retry semantics.
// This is the idiom the visualization helpers use (echartsContainer(), goalLine(), etc.).
const foo = () => cy.findByText("Foo");
foo().click();
```

The difference looks subtle on the page but is huge in implication: a `const` captures the chainer at definition time (already in-flight, not reusable); a function defers the lookup so every call re-runs it.

The `cypress/no-assigning-return-values` lint rule (already on at error level in our e2e config) catches the simple cases. Anything that slips past it — values returned from helper functions, destructuring, indirection through wrapper objects — has to be caught manually.

## Assertions

- Assert on user-visible state: text, URL, aria attributes.
- Don't assert on DOM structure or implementation details.
- `expect()` only inside `cy.then()` / `cy.wrap()` callbacks.
- **Always pair a negative assertion with a positive one.** A standalone `should("not.exist")` / `should("not.be.visible")` will pass by accident if the UI simply hasn't rendered yet — the thing you're claiming is absent was never going to be there at the moment of the check, and you've green-lit a state the test never actually reached. First assert that the page is in the expected state (something positive — text, URL, aria, a settled API response), then assert the thing-that-shouldn't-be-there is absent.

```js
// Bad — passes whenever the page is empty, including pre-render
cy.findByText("Editing").should("not.exist");

// Good — anchor on a positive signal first, then assert absence
cy.findByText("Saved").should("be.visible");
cy.findByText("Editing").should("not.exist");
```

- **Collapse multiple text checks against the same parent into one assertion chain.** When you're checking that a container contains (or doesn't contain) several strings, three separate `findByText().should(...)` queries are slower (each retries independently), noisier, and not atomic — the DOM can change between queries. A single chain on the parent yields the same checks against one snapshot, with one retry budget.

```js
// Bad — three queries, three retry timeouts, no atomicity
parent().findByText("Foo").should("exist");
parent().findByText("Bar").should("exist");
parent().findByText("Baz").should("not.exist");

// Good — one query, one retry budget, atomic
parent()
  .should("contain", "Foo")
  .and("contain", "Bar")
  .and("not.contain", "Baz");
```

## Isolation

- Each `it()` block must be independently runnable.
- Don't rely on state from a previous `it()`.
- Use `beforeEach()` for state reset, not `before()`.
- When both `H.restore()` and `H.resetTestTable()` appear, `H.restore()` must come first (enforced by `metabase/no-unordered-test-helpers`).

## Annotate steps with `cy.log()`, not comments

Prefer `cy.log("...")` over a JS comment when documenting a step or section of a test. Both are equally readable in source, but `cy.log` is dramatically better when something fails:

- It shows up in the Cypress command panel as a logged step.
- It appears in screenshots and videos at the moment it ran, so a CI failure screenshot tells you which phase of the test was active.
- A JS `//` comment is stripped at runtime and is invisible in any failure artifact.

```js
// Bad — invisible at runtime
// Verify the dashboard renders
cy.findByText("My Dashboard").should("be.visible");

// Good — visible in command panel, screenshots, videos
cy.log("Verify the dashboard renders");
cy.findByText("My Dashboard").should("be.visible");
```

Reserve JS comments for things that aren't runtime steps (TODOs, explanations of why an unusual approach was chosen, links to issues).

The same "don't restate the obvious" rule that applies to comments applies to `cy.log` too. A log line that just paraphrases the next command is noise — it doesn't aid debugging, it just clutters the command panel.

```js
// Bad — log adds nothing the helper name doesn't already say
cy.log("Visit dashboard");
H.visitDashboard(id);

// Good — log marks a phase / explains intent
cy.log("Switch to a non-admin and confirm the hidden column is gone");
cy.signInAsNormalUser();
cy.visit(`/question/${questionId}`);
cy.findByText("internal_notes").should("not.exist");
```

Use `cy.log` for phase markers, non-obvious intent ("wait for cache to invalidate before retry"), and section headings in long flows — not as a redundant pre-amble for self-describing commands.

## Performance

### Don't split one flow into many tiny tests

A common anti-pattern carried over from unit-testing habits: one `it()` block per assertion. Every additional `it()` is far more expensive in Cypress than people coming from Jest expect, because the cost stacks twice:

1. **Cypress's own per-test teardown and setup** — resetting the browser context, tearing down and re-initializing the runner, re-bootstrapping plugins/spec environment. In this codebase this overhead empirically lands in the **5–10 second** range per test, before any of your code runs.
2. **Your `beforeEach`** — `H.restore()` + sign-in + page navigation, typically several more seconds on top.

A flow split into 8 tiny `it()` blocks pays that combined overhead 8 times. See the [official anti-pattern doc](https://docs.cypress.io/app/core-concepts/best-practices#Creating-Tiny-Tests-With-A-Single-Assertion).

#### Before merging tiny tests, ask whether they belong in E2E at all

A test whose **only** job is to assert that some elements exist or are visible — no backend interaction worth testing through the wire, no flow that traverses multiple screens, no real-data dependency — is almost always a unit test misfiled into the e2e suite. `frontend/CLAUDE.md` already says "prefer unit tests over E2E tests"; this is the most common failure mode.

Strong signals the test should be a Jest + React Testing Library unit test instead:

- The whole body is `cy.findBy*(...).should("be.visible")` calls inside a single component or panel.
- The test is verifying token-gated UI (a feature flag toggling something on/off in render output).
- The test would still pass against a static mock — the backend's role is incidental.
- There's no user flow; just "render this thing and check it's there."

Real example from a recent PR — this is a unit test masquerading as E2E:

```js
// Bad — boots the whole app + a real DB to assert four pieces of static copy render.
//       Belongs in a Jest unit test for the side-panel component.
it("should show side panel with help content when 'Help is here' is clicked", () => {
  cy.findByRole("button", { name: /Help is here/ }).click();
  cy.findByTestId("database-help-side-panel").within(() => {
    cy.findByText("Add PostgreSQL").should("be.visible");
    cy.findByRole("link", { name: /Read the full docs/ }).should("be.visible");
    cy.findByRole("link", { name: /Talk to an expert/ }).should("be.visible");
    cy.findByRole("button", { name: /Invite a teammate to help you/ }).should(
      "be.visible",
    );
  });
});
```

Two distinct outcomes for these tests:

- **Move to a unit test** — when the static-UI check is genuinely useful coverage but doesn't need the e2e boot. The right home is the component's Jest spec.
- **Delete outright** — when the same issue is already covered by an existing Jest or backend test. The e2e version is just paying full freight for coverage the cheaper layer already provides.

Test isolation does **not** mean one assertion per test. It means each `it()` should be independently runnable. Within a single `it()`, asserting on multiple things across a user flow is correct and expected.

```js
// Bad — three separate boots of the app for one user flow
describe("question editor", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("opens the editor", () => {
    H.openOrdersTable();
    cy.findByText("Pick a function").should("be.visible");
  });

  it("can pick a function", () => {
    H.openOrdersTable();
    cy.findByText("Pick a function").click();
    cy.findByText("Sum of...").should("be.visible");
  });

  it("can apply the function", () => {
    H.openOrdersTable();
    cy.findByText("Pick a function").click();
    cy.findByText("Sum of...").click();
    cy.findByText("Total").click();
    cy.findByText("Sum of Total").should("be.visible");
  });
});

// Good — one boot, one flow, multiple checkpoints
describe("question editor", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("can apply a sum aggregation from the editor", () => {
    H.openOrdersTable();
    cy.findByText("Pick a function").should("be.visible").click();
    cy.findByText("Sum of...").click();
    cy.findByText("Total").click();
    cy.findByText("Sum of Total").should("be.visible");
  });
});
```

### Extend an existing test before adding a near-duplicate

Before writing a new `it()` block, look at sibling tests in the same `describe`. If the new test shares 80–90% of its setup and flow with an existing one and only diverges at the end (a different click, an additional assertion, a tweaked param), extend the existing test instead of spawning a clone.

A near-duplicate test pays the full `beforeEach` cost again, doubles the maintenance surface (two places to update when the flow changes), and obscures intent — readers can't tell why the second test exists if it's not visibly different from the first.

Signals that this is the case:
- The new `it()` repeats the same `H.openOrdersTable()` / `H.visitDashboard(id)` / opening sequence as the test above it.
- The new `it()` differs only in the last few lines.
- The new `it()` title is a near-paraphrase of an existing one ("can pick a sum function" + "can pick an avg function" — these are likely the same test parameterised over function name).

When in doubt, prefer extending the existing test over copy-paste. If the divergence is genuinely large enough to warrant a separate test, the title and the diverging steps will make that obvious.

### Each `cy.visit()` is expensive — navigate via the UI between screens

Metabase's frontend is a React app with a large Redux store. Booting it from cold (which is what `cy.visit()` does) is **expensive** — store hydration, route bootstrapping, settings/permissions/user fetches, etc. Within a single test, the second and third `cy.visit()` are not free "page changes"; they're full app re-boots, each adding multiple seconds.

Once you're already in the app, prefer in-app navigation: click the link, the breadcrumb, the sidebar item, or the entity tile. You keep the warm Redux store, the queries you've already issued, and the rendered shell.

```js
// Bad — three cold boots
cy.visit("/collection/root");
cy.findByText("My Dashboard").should("be.visible");
cy.visit("/dashboard/" + dashboardId);
cy.findByText("Some chart").click();
cy.visit("/question/" + questionId);

// Good — one boot, navigate via UI
cy.visit("/collection/root");
cy.findByText("My Dashboard").click();
cy.findByText("Some chart").click(); // drills into the question
```

`cy.visit()` is still the right call for the **first** navigation in a test (or after an action that genuinely requires a full reload, like a permissions change). It's the second and third unnecessary visit that's the smell.

## Spec structure template

```js
const { H } = cy;
import { ORDERS_DASHBOARD_ID } from "e2e/support/cypress_sample_instance_data";
import { ORDERS, ORDERS_ID } from "e2e/support/cypress_sample_database";

describe("area > sub-area > feature (#issue-number)", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should do the primary happy-path thing", () => {
    // test
  });

  it("should handle the edge case", () => {
    // test
  });
});
```

## Common Cypress framework gotchas

- No JS conditionals on async chains: `cy.get(...).then(el => { if (...) })` runs **once** and yields whatever the DOM looked like at that instant, which is the classic flakiness vector. `.should()` re-runs the previous query and the assertion until it passes or the command times out — that automatic retry is what makes it the right tool for "wait until this is true". Use `.should()` matchers instead.
- No mixing of native Promises (`Promise.resolve`, `async/await`) with cy chains. Cypress has its own thenable.
- Avoid `forEach` over cy queries. Use `cy.each(...)` if you need iteration.
- `.within()` scopes must be properly closed — assertions outside the callback can leak.
- Beware detached DOM: re-query (call `cy.findByText(...)` again) instead of caching a yielded element across re-renders.
- `.should("not.exist")` and `.should("not.be.visible")` mean different things — use the one that matches your intent.
- No `.only` / `.skip` in committed code. A pre-commit hook should block this, but it occasionally slips through.
