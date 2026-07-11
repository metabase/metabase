Task complete. Both the product mutation and the witness are left in the worktree.

## 1. git diff (product mutation)

`frontend/src/metabase/visualizations/components/LeafletMarkerPinMap.tsx`, inside `_createMarkers`:

```diff
-    const crossesLeftDateline = mapWest < -180 && mapEast > -180;
-    const crossesRightDateline = mapWest < 180 && mapEast > 180;
+    const crossesLeftDateline = false && mapWest < -180 && mapEast > -180;
+    const crossesRightDateline = false && mapWest < 180 && mapEast > 180;
```

This forces both dateline-cross flags to `false`, so `shouldGetWrappedPoints` is always `false` and `wrappedPoints = points` (no wrapped copies). It is a faithful semantic revert of the fix — the fix commit `ac7c00c` introduced exactly this wrapping logic; before it, markers were placed once at their raw lat/lng with no `±360` copies.

## 2. Witness

Added `frontend/src/metabase/visualizations/components/LeafletMarkerPinMap.unit.spec.ts`. It constructs a `LeafletMarkerPinMap` instance, stubs `this.map.getBounds()` with a viewport crossing the left dateline (west=-200, east=-150), uses a real empty `L.layerGroup()`, calls `instance._createMarkers([[68,-159,0],[68,159,1]])`, and asserts the layer holds **4** markers (2 originals + 2 wrapped copies). A second test asserts a non-crossing viewport yields exactly 2.

Oracle command:
`bun run test-unit-keep-cljs frontend/src/metabase/visualizations/components/LeafletMarkerPinMap.unit.spec.ts`

- PASS on clean HEAD: both tests green (4 markers, 2 markers).
- FAIL on mutant: `expect(received).toHaveLength(4)` → `Received length: 2` (clean value assertion, not a compile error). Second test still passes, confirming the witness is targeted at the wrapping behavior specifically.

## 3. Bug summary

When a pin map's viewport pans across the international date line, points that sit on the far side of ±180° longitude should be duplicated with a `±360` offset so a copy lands inside the visible viewport. Without the wrapping, a marker whose raw longitude is on the opposite side of the dateline renders off-screen and never appears where the user is looking. The e2e (`maps.cy.spec.js`, `metabase#5369`) checks exactly this: 2 data rows near the dateline produce 4 `.leaflet-marker-icon` elements (one visible + one wrapped copy per point); the buggy code produces only 2.

## 4. Outcome

**witness_authored** — the bug is unit-catchable, so the e2e is replaceable. The wrapping logic in `_createMarkers` is a near-pure seam: it depends only on `map.getBounds()` (west/east) and the input points, and its observable effect (how many markers get added to `pinMarkerLayer`) is directly countable with a stubbed map and a real leaflet layer group — no real browser, tile rendering, geometry, or routing needed.

## 5. Confidence

High. The mutation reintroduces the precise pre-fix behavior (no `±360` wrapped copies), and the witness discriminates on the exact quantity the shipped e2e asserts (4 vs 2 markers). The witness passes on clean HEAD and fails on the mutant with a clean value assertion. The only simplification versus the e2e is that jsdom can't assert per-marker CSS visibility (`.should("be.visible")`), but marker *count* is the causal upstream of that visibility check and is fully sufficient to catch the regression at the unit level.