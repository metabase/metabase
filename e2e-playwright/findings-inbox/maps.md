# maps.cy.spec.js → maps.spec.ts

Source: `e2e/test/scenarios/visualizations-charts/maps.cy.spec.js`
13 tests (9 top-level + 4 in the "Pin Map brush filters" describe). All faithful,
all green on the jar (13/13, and 26/26 under `--repeat-each=2`), slot 3. No
fixmes, no product-bug claims.

New helper module: `support/maps.ts` (`toggleFieldSelectElement`, `zoomIn`,
`getSettledMarkerPosition`, `pinMapSelectRegion`). No shared files edited.

## Fixes classified (all Known gotchas — nothing new)

- **`.trigger("mousemove")` → `dispatchEvent("mousemove")`**, not real hover
  (wave-13 rule). Applied to the marker (#5369 Blastoise tooltip), the region
  choropleth path (#14650 Texas tooltip), and the grid cell (#17940). All three
  leaflet/SVG tooltips surfaced correctly under synthetic dispatch on the jar.
- **`.realHover().realMouseWheel({ deltaY })` → `hover()` + `page.mouse.wheel()`**
  (#5369). Hover parks the cursor over the marker so the wheel zooms at that point;
  the 6→3 marker redraw fires as expected.
- **`cy.button` / `cy.contains("Visualization") / cy.findByText("Visualization")`**
  are the same viz-type toggle — ported as `getByRole("button", {name})` or
  `getByText(..., {exact}).first()`; both resolve the footer button.
- **cypress-real-events brush coordinates are element-top-left-relative** (verified
  against `getCypressElementCoordinates`: a `{x,y}` position and `realMouseMove(x,y)`
  both add to the element's `getBoundingClientRect()` top-left). Ported
  `pinMapSelectRegion` as real `page.mouse` events at `box.x + x` / `box.y + y`,
  10-step drag. All 4 brush tests pass, including the zero-rows and 360°-longitude
  variants.
- **`cy.get(".leaflet-marker-icon")` after `cy.findByTestId("visualization-root")`
  is document-root-scoped** (Cypress `.get` ignores the prior subject) — ported
  #40999 as an unscoped page-wide `.leaflet-marker-icon` count-greater-than-10 poll.
- **`H.visitQuestionAdhoc` native-autorun branch** (#8362) → `visitNativeQuestionAdhoc`
  (charts-extras); query-type → `visitQuestionAdhoc` (permissions).
- **`getSettledMarkerPosition`** ported faithfully: `expect.poll` anchoring on
  `performance.now()` elapsed time (not retry count) so a settled position is
  sampled instead of racing leaflet's zoom/resize animation (#11211).

## Dividends

None. Straight port; the app behaviour matched Cypress on every test. The #11211
settle-on-elapsed-time logic and the #64939 "zoom preserves tooltips" coverage
carried over cleanly.
