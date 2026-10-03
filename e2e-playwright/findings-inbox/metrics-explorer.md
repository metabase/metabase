# metrics-explorer — findings

Port of `e2e/test/scenarios/metrics/metrics-explorer.cy.spec.ts` (2560-line
Playwright spec, 47 tests). Slot 4 / port 4104, source-mode backend.

## Status

**Landed green: 46 tests, 0 skipped, 0 `test.fixme`, 92/92 under
`--repeat-each=2`.** tsc clean. In PORTED.txt as
`metrics/metrics-explorer.cy.spec.ts` (note: the source is `.ts`, not `.js`).

Two fixes were needed, **both port bugs, neither a product bug**:

1. A stricter-than-upstream visibility assertion (Finding 1) — settled by
   running the Cypress original against the same backend, where it passes.
2. A dropped-keystroke race in the spec's own focus helper (Finding 2) —
   flaked at ~40% (2/5); 5/5 after the fix.

**No product bugs found, and none claimed.** The previous agent's "blank UI"
symptom did not recur on a freshly booted backend, matching its own last note.
That was backend staleness (known gotcha — PORTING.md: "Long-lived `--hot`
backends degrade after hours"), not a product issue.

Worth noting for the wider argument: the two defects here were **both in the
port**, and the one that superficially looked like a product bug (a chart
series "not visible") evaporated on the Cypress cross-check. That's the rule
earning its keep for the fourth time.

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

## Finding 2 — lazily-mounted CodeMirror + `autoFocus` silently swallows the first keystrokes

**Classification: NEW GOTCHA (port rule). Not a product bug** — the app behaves
correctly for a real user; this is a harness race.

Test: `Expression custom names › should keep each expression's own name when an
earlier expression is removed` (port line 1300). Flaked at ~40% (2/5 failures)
with two different-looking symptoms that share one cause:

- `expect(searchBarPills).toHaveCount(1)` → received **2** — a lost `+` turned
  `Count of orders + Test Measure` into two independent metric pills.
- `locator.click` timeout on `mini-picker` → `Browse all` — the picker was in the
  wrong state because the operator never landed.

### Root cause

`MetricSearchInput.tsx` renders **two different trees**:

```tsx
{isCollapsed ? (
  <> {/* unfocused: MetricPill / MetricExpressionPill — no editor at all */} </>
) : (
  <div className={S.codeEditor} onFocus={...}>
    <CodeMirror autoFocus data-testid="metrics-viewer-search-input" ... />
  </div>
)}
```

The CodeMirror editor **does not exist** until the container is clicked, and it
takes focus via `autoFocus` (a React effect). Playwright's `click()` resolves as
soon as the event dispatches — before the editor mounts and autofocuses — so a
`page.keyboard.type()` issued immediately after goes to `document.body` and is
lost. The helper returned the input locator without ever waiting on it:

```ts
await formula.click({ position: { x: box.width - 5, y: box.height / 2 } });
return page.getByTestId("metrics-viewer-search-input"); // never awaited
```

Cypress didn't expose this because `cy.type()` re-resolves and retries the
subject before typing, so it naturally waited out the mount.

### Fix

`support/metrics-explorer.ts` — confirm the editor actually holds focus, mirroring
the existing `focusNativeEditor` guard in `support/native-editor.ts`:

```ts
await formula.click({ position: { x: box.width - 5, y: box.height / 2 } });
const input = page.getByTestId("metrics-viewer-search-input");
await expect(input.locator(".cm-content")).toBeFocused();
return input;
```

5/5 green after the fix (was 3/5).

### Rule to add to PORTING.md

Rule 5 says *"CodeMirror/keyboard: click to focus, then `page.keyboard.type()`"*.
Add the missing half: **after clicking, assert the editor took focus before
typing** — `expect(editor.locator(".cm-content")).toBeFocused()` (or the
`cm-focused` class check `focusNativeEditor` uses). This matters most where the
editor is **mounted lazily on focus**, as in MetricSearchInput: the click
resolves before the mount+autoFocus effect, and dropped keystrokes surface far
away from their cause (a wrong pill count, or an unrelated picker timeout).
`page.keyboard.*` has no implicit retry — unlike `cy.type()`, which re-resolves
its subject — so any `keyboard` call following a click that *creates* the focus
target needs this guard.

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
