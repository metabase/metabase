# metrics-explorer — findings

Port of `e2e/test/scenarios/metrics/metrics-explorer.cy.spec.ts` (2560-line
Playwright spec, 47 tests). Slot 4 / port 4104, source-mode backend.

## Status

First full run on a **freshly booted** backend: 45 passed / 1 failed. After the
fix below: green, and stable under `--repeat-each=2`. One fix needed, and it
was a **port bug, not a product bug** — established by running the Cypress
original against the same backend (it passes).

The previous agent's "blank UI" symptom did not recur on a fresh backend,
matching its own last note. That was backend staleness (known gotcha —
PORTING.md: "Long-lived `--hot` backends degrade after hours"), not a product
issue. No finding.

## Finding 1 — `should("be.visible")` on a multi-element subject is an ANY, not ALL, assertion

**Classification: NEW GOTCHA (port rule), plus a test-suite dividend.**
**Not a product bug** — cross-checked, see below.

Test: `Filters › should preserve breakout colors when a dimension filter hides
some values` (port line 2093; Cypress original line 1929).

### What happened

The port rendered the Cypress assertion

```js
H.echartsContainer().find(`path[stroke="${hex}"]`).should("be.visible");
```

as

```ts
await expect(
  echartsContainer(page).locator(`path[stroke="${color}"]`).first(),
).toBeVisible();
```

and failed: `Expected: visible / Received: hidden`, on
`<path fill="none" d="M480.31 68.1" stroke="#509EE3" stroke-width="2">`.

### Cross-check (the FIDELITY RULE)

Ran the original Cypress spec against the **same** backend (`MB_JETTY_PORT=4104`),
grepped to this test: **it passes** (27.5s). Different result from the port ⇒
**the port drifted**. No product-bug claim.

### Root cause — verified, not inferred

Dumping the actual DOM at the assertion point shows ECharts renders **two**
paths per series, both carrying the series stroke colour:

| `d` | bbox | visible? |
|---|---|---|
| `M480.31 68.1` (lone moveto — the line path) | 0×0 | no |
| `M1 0A1 1 0 1 1 1 -0.0001` (symbol marker) | 6×6 | yes |

The test's date filter narrows the window to Feb 1–7 2027, which leaves each
breakout series with exactly **one data point**. A one-point line series
legitimately draws only its marker — the line path is a zero-length subpath and
paints nothing. So the zero-extent path is correct app behaviour.

Why Cypress passes and Playwright doesn't, confirmed in the Cypress 15.14.1
bundled runner source:

1. Cypress replaces jQuery's `:visible` filter with its own visibility logic —
   `$.expr.filters.visible = el => dom.isVisible(el)`
   (comment in source: *"force jquery to have the same visible and hidden logic
   as cypress"*).
2. chai-jquery's `visible` property assertion resolves to `this._obj.is(":visible")`.
3. jQuery's `.is(selector)` returns true when **at least one** element of the set
   matches.

So `cy.get(...).should("be.visible")` over a 2-element set passes because the
*marker* is visible — even though Cypress's own `isVisible` rejects the
zero-extent line path (`elHasNoEffectiveWidthOrHeight` → `getBoundingClientRect()`
is 0×0 → `display: inline` → `!elHasVisibleChild()` → hidden).

Playwright's `.first()` is strict DOM order, so it lands on the line path and
correctly reports it hidden.

### Fix

Scope to the visible matches, which is what upstream effectively asserts:

```ts
await expect(
  echartsContainer(page)
    .locator(`path[stroke="${color}"]`)
    .filter({ visible: true })
    .first(),
).toBeVisible();
```

### Dividend / rule to add to PORTING.md

PORTING.md rule 3 currently says *"Cypress first-match semantics (`.prop`,
`.contains`) = `.first()`"*. That list is incomplete in a way that bites:
**`should("be.visible")` (and the other chai-jquery state assertions —
`be.hidden`, `be.checked`, `be.selected`, `be.disabled`) are ANY-of-set
assertions, not first-match and not all-of-set.** Porting them with `.first()`
silently *strengthens* the assertion and produces failures that look like
product bugs. Port them as "at least one match satisfies it"
(`.filter({ visible: true }).first()`), not `.first()`.

The test-suite dividend: the upstream assertion is weaker than it reads. "Chart
series colors should match legend colors" passes as long as *any* path of that
colour is visible, so it would not catch the line path disappearing. Worth
noting if anyone strengthens this test later.

## Infra note — snowplow-micro is needed for the Cypress cross-check

`snowplow-micro` (`:9090`) is not in PORTING.md's "Local services the ports
assume" list, and the Playwright port doesn't need it (snowplow helpers are
no-op stubs per rule 6). But the **Cypress original** calls `resetSnowplow()` in
a `beforeEach` and `expectNoBadSnowplowEvents()` in an `afterEach`, both
`cy.request()`ing `http://localhost:9090/micro/*`. With the container down the
entire `explorer` describe dies in the before-each hook — which looks alarming
and is pure environment.

Since the fidelity cross-check against the Cypress original is now standard
procedure, `snowplow/docker-compose.yml` should be listed as required *for
cross-checks* of any snowplow-tagged spec. Suggest adding to PORTING.md.

## Infra note — running the Cypress original for a cross-check

Two traps cost time here; worth recording for the next agent:

- **Grep**: `--env grep="..."` does **not** filter. `e2e/support/config.js:151`
  reads `config.expose.grep ??= process.env.GREP`, so use the `GREP` env var:
  `MB_JETTY_PORT=4104 GREP="test title" bunx cypress run --browser chrome \
     --config-file e2e/support/cypress.config.js --spec <spec>`
- A full un-grepped Cypress run of this spec mass-failed (17+ tests) in one
  attempt and passed those same tests in the next — the un-grepped full-file
  Cypress run is flaky on a shared dev backend and is **not** a trustworthy
  comparison baseline. Grep to the single test under investigation.
