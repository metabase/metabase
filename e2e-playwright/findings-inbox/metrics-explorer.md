# metrics-explorer — findings

Port of `e2e/test/scenarios/metrics/metrics-explorer.cy.spec.ts` (2560-line
Playwright spec, 47 tests). Slot 4 / port 4104, source-mode backend.

## Status

First full run on a **freshly booted** backend: **45 passed / 1 failed**.
The previous agent's "blank UI" symptom did not recur — consistent with its
own last note that a fresh backend rendered correctly. No product bug there;
it was backend staleness (known gotcha, PORTING.md "Long-lived `--hot`
backends degrade after hours").

## Infra note (not a dividend, but a trap worth recording)

`snowplow-micro` is NOT in the list of containers PORTING.md says the ports
assume ("Local services the ports assume"), but the **Cypress originals need
it**: `metrics-explorer.cy.spec.ts` calls `resetSnowplow()` in a `beforeEach`
and `expectNoBadSnowplowEvents()` in an `afterEach`, both of which
`cy.request()` `http://localhost:9090/micro/*`. With the container down the
whole `explorer` describe dies in the before-each hook.

This matters specifically for the **fidelity cross-check**: you cannot compare
a Playwright port against its Cypress original for any snowplow-tagged spec
without `snowplow/docker-compose.yml` up. The Playwright port stubs snowplow
to no-ops (per PORTING.md rule 6), so the port itself does not need it — only
the cross-check does. Suggest adding snowplow-micro to PORTING.md's
"Local services" list with that caveat.

## Finding 1 — Cypress `should("be.visible")` vs Playwright `toBeVisible()` on zero-extent SVG paths

**Classification: NEW GOTCHA (harness semantics), not a product bug.**

Test: `Filters › should preserve breakout colors when a dimension filter hides
some values` (spec line 2093; Cypress original line 1929).

The test filters the metric to a 7-day window (Feb 1–7 2027), then asserts each
legend colour has a matching chart series:

```
// Cypress
H.echartsContainer().find(`path[stroke="${hex}"]`).should("be.visible");

// port
await expect(
  echartsContainer(page).locator(`path[stroke="${color}"]`).first(),
).toBeVisible();
```

The port failed with:

```
Locator: getByTestId('chart-container').locator('path[stroke="#509EE3"]').first()
Expected: visible / Received: hidden
24 × locator resolved to
  <path fill="none" d="M480.31 68.1" stroke="#509EE3" stroke-width="2" ...>
```

`d="M480.31 68.1"` is a **single `moveto` with no line segments** — a
degenerate, zero-length path. Narrowing to a 7-day window leaves each breakout
series with exactly one data point, so ECharts emits a line path with no
extent. Playwright's `toBeVisible()` requires a non-empty bounding box, so a
zero-area SVG path is "hidden". Cypress's visibility rules do not reject it.

This is the app rendering correctly (a one-point line series legitimately has
no line), and the assertion's real intent is "a series with this colour exists
in the chart" — not "the line has length".

(cross-check status + fix recorded below)
