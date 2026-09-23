# scatter.cy.spec.js → tests/scatter.spec.ts

6 tests, all green on the jar (slot 4, COMMIT-ID 751c2a98), 12/12 under
`--repeat-each=2`. New helper: `support/scatter.ts` (`triggerPopoverForBubble`
only). No product bugs, no fixmes.

## Fixes classified

1. **view-footer data/viz toggle needs `{ force: true }` (known gotcha).**
   `getByLabel("Switch to data")` resolves the aria-labelled `<svg>`, which
   Playwright reports "element is not enabled" — the toggle is a SegmentedControl
   that marks both options `disabled` and switches via the root onClick. Same
   fix already used in pie-chart.spec.ts:143 and
   visualizations-tabular-reproductions.spec.ts:1434. The brief should carry this
   forward: any port that toggles the QB view footer must force the click. The
   porting agent should have anticipated it from those precedents.

2. **Empty-string tooltip value: shared `assertEChartsTooltip` diverges from
   upstream.** The `Discount` row has value `""`. Cypress's `assertTooltipRow`
   guards with `if (value)` (truthy), so an empty value is skipped and only the
   row's presence is asserted. The shared port in
   `support/viz-charts-repros.ts` guards with `value != null`, so it tries to
   match `getByText("", { exact: true })` and fails on the hidden empty `<span>`.
   Worked around in-spec (can't edit shared files): map `value === ""` rows to
   `{ name }` only, then assert the `Discount` label separately via
   `echartsTooltip(page).getByText("Discount")`.

   **Consolidation / correctness candidate:** `viz-charts-repros.ts`'s
   `assertEChartsTooltip` should change its value/secondaryValue/footer guards
   from `!= null` to a truthiness check to match upstream `if (value)`. As-is it
   over-asserts empty values and will bite any other tooltip port with a blank
   cell. (Both `assertEChartsTooltip` copies — viz-tabular-repros.ts and
   viz-charts-repros.ts — are already flagged for merging; fix the guard when
   they're unified.)

## Faithful ports of note

- `H.cartesianChartCircle()` = `cartesianChartCircles().should("be.visible")`;
  scatter bubbles are the same `M1 0A1 1 0 1 1 1 -0.0001` circle paths as
  line/area markers, so `cartesianChartCircles` (metrics.ts) resolves them. The
  visibility gate is supplied by each call site (hover actionability /
  boundingBox).
- `.trigger("mousemove", { force })` → synthetic MouseEvent dispatch at the
  bubble center (wave-13 gotcha). Cypress's `force` (overlap bypass) is a no-op
  for a direct synthetic dispatch — kept for signature fidelity.
- #22929 (circle size): native + `visualization_settings` → `visitNativeAdhoc`
  (viz-charts-repros wrapper widens the narrow adhoc type). Asserted the
  *behaviour* (bubbles roughly circular, width>0, r0≠r1) not pixel values — no
  data-derived magic numbers pinned.
