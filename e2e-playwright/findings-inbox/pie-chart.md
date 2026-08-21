# pie_chart.cy.spec.js → tests/pie-chart.spec.ts

Source: `e2e/test/scenarios/visualizations-charts/pie_chart.cy.spec.js` (743 lines).
New helper module: `support/pie-chart.ts`.

## Result

- 14 tests ported (incl. the `[false, true].forEach(devMode)` pair). Issue
  numbers kept exact: metabase#12506, #35244, #48123, #29224, #48207, #50692,
  VIZ-210. All 14 green on the jar (slot 3), 28/28 under `--repeat-each=2`.
  tsc clean.
- Verified against the CI EE uberjar (`target/uberjar`, COMMIT-ID 751c2a98),
  the jar-mode default.

## New gotcha (candidate for PORTING.md) — pie drill fires on the wedge `<path>`, never the label `<text>`

The two big drill tests ("hover and drill", devMode ×2) click a pie slice to
drill. Upstream `cy.findByText("Saturday").click({force:true})` /
`cy.findAllByText("Doohickey").first().click({force:true})` click the slice
**label**. In Playwright this never opens the drill popover, for two compounding
reasons confirmed by DOM inspection on the jar:

1. **The drill handler is on the wedge `<path>`, not the label.** Metabase's
   pie uses zrender's **SVG** renderer. A real click on the label `<text>`
   (even forced) does not reach the slice's click handler; and pie labels for
   thin slices are **leader labels placed off the wedge, over bare `<svg>`**
   (`document.elementsFromPoint` at the label centre returns text→svg→divs, no
   path), so there is nothing drillable under them. `dispatchEvent("click")`,
   and even a full synthetic `pointerdown/mousedown/pointerup/mouseup/click`
   sequence on the label, were **both tried and both fail** — zrender does not
   map those to a slice drill.
2. **The open tooltip overlays a real click at the label.** After the hover
   that the assertion needs, the ECharts tooltip renders over the cursor and
   intercepts a real forced click there.

Fix pattern: **drill by clicking the wedge `path` with `click({force:true})`**
(the same thing the chart-drill precedent does with `pieSliceWithColor`). Force
is required because the tooltip overlaps and because the path center isn't the
strict actionable point. This is now the recommended way to port any pie/donut
slice `.click()`.

## Multi-ring pie slice colouring (needed to target a specific wedge)

For the two-ring pie (day-of-week inner, category outer), fills go:

- **Inner ring**: one distinct hex per day (Saturday `#51528D`, Wednesday
  `#F7C41F`, …) — matches the colours the tooltip assertion already hardcodes.
- **Outer ring**: **fill identifies the day, not the category** — each day's 4
  category slices share one colour (the lighter variant of the day's inner
  colour; Wednesday → `#F9D45C`). Within a day's four slices, DOM/nth order is
  category order, so `pieSliceWithColor(page, "#F9D45C").nth(0)` is the
  Wednesday **Doohickey** wedge (verified: drills to `Count = 603`).

Because hovering a slice **emphasises it and changes its fill**, the
`#F9D45C`-colour locator moves off the hovered wedge — so the Doohickey wedge is
captured as an `elementHandle()` **before** the tooltip hover, then clicked
after. (Saturday's inner slice is a single unique colour, so hover-then-click on
the same locator is fine there.)

## Known-gotcha fixes (force-click class)

- **`getByLabel("Switch to data")`** resolves to the non-focusable `<svg>` icon,
  which Playwright treats as "not enabled" → `click({ force: true })` (Cypress
  clicks it regardless). #35244.
- **`cy.icon("chevrondown").realClick()`** on a ring's field-picker: the Mantine
  `Select` input overlays its own chevrondown and intercepts the pointer →
  `click({ force: true })` (bubbles to the Select trigger). Rule-4 / wave-10
  "descendant of overlay" flavour.

## Helper reuse notes

- `pieSlices` reused from `dashboard-card-repros.ts`, `pieSliceWithColor` from
  `chart-drill.ts`, `chartPathWithFillColor` from `binning.ts`,
  `assertEChartsTooltip` / `visitAdhoc` / `visitNativeAdhoc` /
  `moveDnDKitElementVertically` from `viz-charts-repros.ts`,
  `createQuestionAndDashboard` from `click-behavior.ts` (the `mb.api` variant
  doesn't type `visualization_settings`),  `findByDisplayValue` from
  `filters-repros.ts`. Only genuinely-new spec-local helpers went in
  `support/pie-chart.ts` (ensurePieChartRendered, checkLegendItemAriaCurrent,
  getLimitedQuery, changeRowLimit, renameSlice, confirmSliceClickBehavior).
- `aria-current` is an **enumerated** attribute ("true"/"false"), not boolean,
  so `should("have.attr","aria-current",value)` ports literally to
  `toHaveAttribute("aria-current", value)` (not the boolean-presence gotcha).
- The devMode `cy.intercept("/api/session/properties").continue(res => …)`
  ports to `page.route(...)` that re-fetches and fulfils with a mutated
  `token-features.development_mode` JSON.
