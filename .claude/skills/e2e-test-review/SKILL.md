---
name: e2e-test-review
description: Review Cypress E2E spec files for Metabase conventions, common gotchas, and flakiness/performance issues. Use when reviewing pull requests or diffs containing Cypress spec files in e2e/test/scenarios/.
allowed-tools: Read, Grep, Bash, Glob
---

# E2E Test Review Skill

@./../_shared/cypress-conventions.md

## Review mode detection

Before starting, determine which mode to use:

1. **PR review mode** — if `mcp__github__create_pending_pull_request_review` is available, post issues as one cohesive pending review.
2. **Local review mode** — if not, output a numbered list in the conversation.

## Review process

1. Detect mode.
2. Read the changed spec end-to-end first to understand intent. Don't review line-by-line cold.
3. **(Conditional)** If after reading the spec a specific assertion or selector is **ambiguous** — you can't tell if it's the right anchor, or whether the test actually verifies what its title claims — briefly grep the related component for the test ID / role / text. **Don't read components by default.** Only do this when there's a real signal of confusion in the spec.
4. Scan against the checklist + pattern table below.
5. Number all issues sequentially. Skip nits — only flag what's worth fixing.

### When to hand off instead of review

If the spec references an issue (`metabase#NNNNN`) and the user wants to **fix** flakiness or assess whether the test still reproduces the original bug, that's outside the review skill's scope. Point them at `/fix-flakey-test` (or the dedicated flake-fixing workflow), which knows to fetch the issue and the resolving PR's diff. The review skill stays focused on "is this test well-written and conformant" — it doesn't fetch external issue context by default.

## Review checklist

The checklist mirrors the order of the conventions file. Items marked **(lint)** are also caught by ESLint — flag only when you see them slip through (helper-wrapped, lint-disabled, etc.).

### File and naming

- [ ] Spec lives in `e2e/test/scenarios/<area>/`
- [ ] Extension is `.cy.spec.ts` (preferred) or `.cy.spec.js` — don't flag `.js` on existing files
- [ ] `describe` block names the area when relevant: `"area > sub-area > feature (#issue-number)"`
- [ ] No leftover `.only` or `.skip` (pre-commit hook should catch, but flag it if it slips through)

### Helpers and constants

- [ ] Helpers accessed via `const { H } = cy;` — no direct imports from `e2e/support/helpers` **(lint)**
- [ ] Sample DB schema imported from `cypress_sample_database`
- [ ] Instance data IDs imported from `cypress_sample_instance_data`
- [ ] **No hardcoded numeric IDs anywhere** — including for entities the test creates itself. Capture from the create response or alias the intercept.
- [ ] Existing navigation helpers used (`H.openOrdersTable`, `H.visitDashboard(id)`, etc.) instead of raw `cy.visit()` chains

### Selectors

- [ ] Prefers a11y queries (`findByRole`, `findByLabelText`) over `findByText`
- [ ] `findByText` only when an a11y query doesn't fit
- [ ] `findByTestId` for `data-testid` attributes (never raw `cy.get("[data-testid='...']")`)
- [ ] No CSS class names — especially generated ones from styled-components/Mantine (`.css-1abc2d`)
- [ ] No ad-hoc CSS attribute selectors in specs or new helpers (the visualization helpers in `e2e/support/helpers/e2e-visual-tests-helpers.js` are the **only** intentional exception — see "What NOT to flag")
- [ ] No XPath
- [ ] **Positional selectors** (`.eq()`, `.first()`, `.last()`, `:nth-child`) only when the order is the assertion itself, or guarded by a length assertion immediately before. **(lint catches `.last()` and `.eq(<negative)`; the rest is on the reviewer)**
- [ ] **Text selectors are scoped** — top-level `cy.findByText(...)` / `cy.contains(...)` in `it`/`before`/`beforeEach` is forbidden. Must be scoped via `cy.contains(selector, text)`, `cy.someQuery().findByText(...)`, or `someQuery().within(...)`. **(lint catches the top-level case ONLY — it does NOT catch helper-wrapped queries; manually scan helper bodies)**

### Setup and isolation

- [ ] State setup uses `cy.request` / API helpers, not the UI
- [ ] `H.restore()` and sign-in are in `beforeEach`, not `before`
- [ ] Each `it()` is independently runnable — no `it()` depends on prior `it()` state
- [ ] When both appear, `H.restore()` precedes `H.resetTestTable()` **(lint)**

### Waits and timing

- [ ] No numeric `cy.wait(ms)` — even small ones
- [ ] `cy.intercept()` defined BEFORE the action that triggers the request
- [ ] No `setTimeout`, `Cypress.Promise.delay`, or other manual sleeps
- [ ] No long custom timeouts (e.g. `{ timeout: 30000 }`) papering over a race
- [ ] DOM readiness uses `.should("be.visible")`, **not** `.should("exist")`. Reserve `exist` for hidden inputs / off-screen / portal-detached cases.

### Never assign return values from `cy.*` commands

- [ ] No `const x = cy.someCommand(...)` — `x` is a one-shot chainer, not the resolved value **(lint catches simple cases)**
- [ ] If a query needs a name, it's wrapped in a function (`const foo = () => cy.findByText("Foo")`), **not** assigned to a `const`
- [ ] Resolved values accessed via `.then()` or aliased with `.as()` + `cy.get("@alias")`
- [ ] Aliases only used when there's distance between lookup and use (otherwise just chain)

### Assertions

- [ ] Assertions target user-visible state (text, URL, aria) — not DOM structure
- [ ] **Negative assertions are paired with a positive one.** A standalone `should("not.exist")` / `should("not.be.visible")` passes by accident if the page hasn't rendered yet. Anchor on a positive signal first.
- [ ] **Multiple text checks on the same parent are collapsed into a `.should("contain", ...).and("contain", ...).and("not.contain", ...)` chain** rather than three separate `findByText().should(...)` queries. Single retry budget, atomic against one DOM snapshot.
- [ ] `expect()` only used inside `cy.then` / `cy.wrap` callbacks
- [ ] `.should("not.exist")` vs `.should("not.be.visible")` used correctly for intent
- [ ] No JS conditionals on cy chains (`.then(el => if (...))`) — `.then()` runs once, `.should()` retries

### `cy.within` (always chained)

- [ ] **Every `cy.within(...)` is chained off a previous selector.** Standalone `cy.within(...)` has no scope and is wrong by construction — flag on sight.
- [ ] **No single-statement `within` callbacks** — if the callback has only one inner command, chain directly off the parent instead. Reserve `within` for two or more commands sharing the scope.
- [ ] **No named parameter on `within` callbacks** — `within((modal) => ...)` is redundant; the subject is inherited automatically by inner commands. If you actually need the jQuery subject, use `.then($el => ...)` instead.
- [ ] `.within()` callback is properly closed; assertions outside the callback don't accidentally rely on the within scope

### Logging and annotation

- [ ] Step annotations use `cy.log("...")`, not `// comments` (visible in command panel, screenshots, videos)
- [ ] `cy.log` lines aren't redundant paraphrases of the next command — they mark phases or non-obvious intent

### Performance

- [ ] **Tiny tests** — multiple `it()` blocks for the same flow with the same `beforeEach` setup are a smell. Each `it()` costs 5–10s of Cypress runner overhead + the `beforeEach` cost; merge into a single flow when possible.
- [ ] **Tiny tests that should be unit tests** — a test that only asserts on element existence/visibility (no flow, no real backend interaction, no cross-screen traversal) belongs in a Jest + RTL unit test, not e2e. Common offenders: token-gated UI checks, "renders the help panel" tests.
- [ ] **Near-duplicate tests** — a new `it()` that shares 80–90% of its setup and steps with a sibling test should extend the existing test, not spawn a clone.
- [ ] **Multiple `cy.visit()` calls** — each is a cold app boot (multi-second). After the first visit, navigate via the UI (click a link, breadcrumb, sidebar item) instead of issuing a second `cy.visit()`.
- [ ] **Redundant with a cheaper-layer test** — when the spec references an issue (e.g. `metabase#12345`) in the test name or `describe`, grep the codebase for the **bare** `#NNNNN` (no `metabase` prefix — backend tests don't always include it). If a Jest spec or backend `_test.clj` already cites the same issue, the e2e test is already redundant; recommend deletion. Recipe:
      ```bash
      rg "#12345" -g '*.spec.{ts,tsx,js,jsx}' -g '!*.cy.spec.*' -g '*_test.clj' -g '*_test.cljc'
      ```
      The `-g '!*.cy.spec.*'` exclusion drops the e2e spec being reviewed (which will obviously match its own reference).

### Cypress framework anti-patterns

- [ ] No `forEach` over cy queries — use `cy.each()` if iteration is needed
- [ ] No mixing native Promises / `async`-`await` with cy chains
- [ ] No reliance on stale element references after re-render — re-query instead
- [ ] No `cy.contains("text")` (single-arg, top-level) — same scoping rule as `findByText`

## Pattern matching table

Quick scan for common issues. **(lint)** marks patterns ESLint already catches in the simple form — flag when you see them slip through.

| Pattern                                                      | Issue                                                                                                                          |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `cy.wait(2000)`                                              | Numeric wait — use intercept alias or `.should("be.visible")`                                                                  |
| `cy.get(".css-1abc2d")`                                      | Generated CSS class — use a11y query / `findByText` / `findByTestId`                                                           |
| `cy.get("[data-testid='foo']")`                              | Always use `cy.findByTestId('foo')` instead                                                                                    |
| `cy.get("path[fill='#abc']")` in a spec                      | Ad-hoc chart selector — use `e2e-visual-tests-helpers` or add a new helper there                                               |
| `cy.get("li:nth-child(3)")`                                  | Positional in a CSS selector — anchor on text or role                                                                          |
| `.last()` / `.eq(-1)` without a prior length assertion       | Risk of off-by-one when collection size shifts **(lint)**                                                                      |
| `cy.visit("/dashboard/10")`                                  | Hardcoded numeric ID — capture from create response or import from `cypress_sample_instance_data`                              |
| `import { restore } from "e2e/support/helpers"`              | Direct helper import — use `const { H } = cy;` **(lint)**                                                                      |
| `cy.findByText("Save")` at top of `it()` / `beforeEach`      | Unscoped text selector — wrap in `cy.contains(selector, text)` or chain off a scoping query **(lint, BUT misses helper-wrapped)** |
| `function clickSave() { cy.findByText("Save").click() }`     | Helper-wrapped unscoped text — lint blind spot, scan helpers manually                                                          |
| Standalone `cy.within(() => ...)`                            | `cy.within` must be chained off an existing selector — wrong by construction                                                   |
| `cy.intercept` placed AFTER the triggering call              | Intercept must precede the action                                                                                              |
| `cy.get(...).then(el => { if (...) })`                       | JS conditional on cy chain — use `.should()` for retry semantics                                                               |
| `await cy.something()`                                       | Cypress chains aren't real Promises                                                                                            |
| `els.forEach(el => cy....)`                                  | Use `cy.each()` instead                                                                                                        |
| `{ timeout: 30000 }` on a single command                     | Likely papering over a race — find the root cause                                                                              |
| `const button = cy.findByRole(...)`                          | Assigning `cy.*` return value — `button` is a one-shot chainer, not a DOM element **(lint catches simple cases)**              |
| `const foo = () => cy.findByText("Foo")`                     | This is **fine** — the function form re-enqueues the query on each call                                                        |
| `.should("not.exist")` as the only assertion in a step       | Negative-only — passes by accident if page hasn't rendered. Anchor on a positive assertion first                               |
| `H.resetTestTable()` before `H.restore()`                    | `restore` must come first **(lint)**                                                                                           |
| Multiple `cy.visit()` in one `it()` block                    | Each is a cold boot — navigate via the UI between screens                                                                      |
| `it.only(` / `describe.only(`                                | Pre-commit hook should block — flag as slip                                                                                    |
| New `it()` block with same setup + 80–90% same steps as sibling | Likely a near-duplicate — extend the existing test instead                                                                  |
| `it("...", () => { cy.findBy*().should("be.visible") })` only | Static-UI-only test — strong signal it should be a Jest unit test, not e2e                                                    |
| `cy.log("Visit dashboard"); H.visitDashboard(id);`           | Redundant log — paraphrases the next command                                                                                   |
| `// Visit dashboard` followed by `H.visitDashboard(id);`     | Use `cy.log("...")` instead — visible in screenshots/videos                                                                    |

## What NOT to flag

- Don't flag the `.cy.spec.js` extension on existing files — both `.js` and `.ts` are acceptable; `.ts` is preferred only for **new** specs.
- Don't flag CSS attribute selectors (`path[fill='...']`, `[stroke-dasharray='...']`, `text[stroke-width='3']`, etc.) inside `e2e/support/helpers/e2e-visual-tests-helpers.js`. ECharts renders SVG with no `data-testid` and minimal a11y, and that file is the intentional exception. **Do** flag the same patterns when they appear in spec files or in new helpers — those should funnel through the existing helpers or extend that file.
- Don't flag `.first()` / `.eq(N)` / `:nth-child(N)` when the order is genuinely the assertion (e.g. testing sort order) or when a `.should("have.length", n)` immediately precedes them.
- Don't flag `cy.findByText(...)` / `cy.contains(...)` inside a helper body **if** the helper is documented or clearly intended to be called from inside an outer `within(...)` scope at the call site (the inherited within scope makes it safe at runtime). When in doubt, ask the author.
- Don't flag `.only` if you're doing a local-dev review (the user is intentionally focused). At PR / commit-time review, do flag it.
- Don't post "looks good" or congratulatory comments. Only post issues.
- Don't post comments for formatting issues that the linter handles (Prettier/ESLint).
- Don't flag stylistic preferences that don't materially affect flakiness, speed, or correctness.

## Feedback format

Number every issue sequentially starting from `Issue 1`. Format: `**Issue N: [Brief title]**`.

### Local review mode

```markdown
## Issues

**Issue 1: [Brief title]**
File:Line — succinct description
Suggested fix

**Issue 2: [Brief title]**
...
```

### PR review mode

Use the pending review workflow:

1. `mcp__github__create_pending_pull_request_review` — start a draft review.
2. `mcp__github__get_pull_request_diff` — get file paths and line numbers.
3. Identify ALL issues, number them sequentially.
4. `mcp__github__add_pull_request_review_comment_to_pending_review` — post each issue as a separate comment, in **parallel** within a single response.
5. `mcp__github__submit_pending_pull_request_review` with event `"COMMENT"` (not `REQUEST_CHANGES`), no body.

Each comment body starts with `**Issue N: [Brief title]**`.

## Final check

1. Trim issues that won't materially help the author.
2. Verify sequential numbering with no gaps.
3. In PR mode, verify each issue was posted as a separate review comment.
