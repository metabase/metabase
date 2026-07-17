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
