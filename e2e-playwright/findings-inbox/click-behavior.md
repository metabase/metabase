# click-behavior.cy.spec.js → tests/click-behavior.spec.ts

Port of `e2e/test/scenarios/dashboard-cards/click-behavior.cy.spec.js` (2786 lines, 42 tests).
Written by a previous agent; this entry records verification.

Status: IN PROGRESS — written incrementally as findings land.

## Verification setup

- Slot 1, port 4101. The pre-existing slot-1 backend had been up for many hours;
  killed and rebooted fresh (123s, source mode) before trusting any result, per
  the known staleness trap. Hot bundle checked (`:8080/app/dist/app-main.hot.bundle.js`
  → 200, 55MB), so the blank-UI/stale-asset trap is ruled out.
- `bunx tsc --noEmit` clean from `e2e-playwright/`.

## Fix 1 — `clickLineChartPoint` drifted (PORT BUG, not a product bug)

**Symptom**: 18 of 22 `line chart` tests failed; the 4 that passed were the ones
that never click a chart point. The `table` describe's identically-named
drill-through test passed, so `popover()` and the drill machinery were fine —
only the chart-point click was dead.

**Cross-check (fidelity rule)**: ran the ORIGINAL Cypress spec against the SAME
backend (`MB_JETTY_PORT=4101`). `line chart › should open drill-through menu as
a default click-behavior` **PASSES in Cypress** and fails in the port.
→ Different failures = the port drifted. NOT a product bug. No claim made.

**Root cause**: instrumented the page (`document.elementFromPoint`) at the exact
click coordinate the port used:

- circle bbox = 14x14 at (446.4, 221.0); `window.scrollY == 0` and
  `document.body` rect is at (0,0), so Cypress's body-relative `.click(left, top)`
  and Playwright's viewport-based `mouse.click(box.x, box.y)` address the *same*
  point — the coordinate math was NOT the drift.
- `elementFromPoint` at the circle's **top-left corner** → bare `<svg>`.
- `elementFromPoint` at the circle's **centre** → the circle `path` itself.

The Cypress helper's comment justifies clicking the corner to avoid hitting both
`g.voronoi > path` and `circle.dot` — **d3-era constructs that no longer exist**
now that the chart renders via ECharts. The comment (and the corner trick) is
vestigial upstream; the port reproduced the corner coordinate faithfully but
without the voronoi layer that used to make the corner clickable.

(continued — fix and its verification appended below as they land)

**Fix applied**: click the point itself (`circle.click()`) instead of its corner.

**Experiment that settled the mechanism** (4 strategies, same page/backend):

| strategy | drill menu opens? |
|---|---|
| A: `mouse.click` at circle centre | YES |
| B: hover centre, then click centre | YES |
| C: `locator.click()` on the circle | YES |
| D: Cypress's EXACT synthetic sequence at the top-left corner | **NO** |

D is the important one: reproducing Cypress's own mechanism at Cypress's own
coordinate opens nothing. So the corner is not hittable in *either* harness —
Cypress passes **in spite of** the corner trick, not because of it. The
coordinate systems match (scrollY 0, body at origin), so this is not a
Cypress-vs-Playwright coordinate difference.

**Result**: line-chart chunk went 4/22 → 10/22 passing. The three
filter-updating tests (`allows updating single dashboard filter`, `behavior is
updated after linked dashboard filter has been removed`, `allows updating
multiple dashboard filters`) all pass — these are precisely the tests the
upstream comment says break under a double click, so the centre click fires
ECharts' series `click` exactly once. Canary green.

**Classification**: PORT BUG (new gotcha — see below). Not a product bug; no
claim made against the app.

**Candidate dividend (test-suite defect, upstream)**: `clickLineChartPoint` in
`e2e/test/scenarios/dashboard-cards/click-behavior.cy.spec.js` (~line 2765)
clicks a coordinate where nothing is hittable, and its explanatory comment
refers to `g.voronoi > path` / `circle.dot`, which the ECharts migration
removed. The Cypress tests still pass, which means **the click is not what
makes them pass** — worth a look upstream, because a helper whose click lands
on nothing is not testing the interaction it claims to. Scope of this claim:
observed on this spec's line-chart dashcards on a source-mode EE backend;
I did NOT verify what Cypress's assertions are actually riding on.
