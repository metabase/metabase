The mutation and witness are both in place. Task complete.

## Report

### 1. git diff (product mutation)

Semantic revert in `frontend/src/metabase/visualizations/components/LeafletMap.tsx` (`syncMapFromProps`) — removes the "pure resize" view-preservation branch that the fix commit added:

```diff
-    const { bounds, settings, zoomControl, zoom, lat, lng } = this.props;
+    const { bounds, settings, zoomControl } = this.props;
...
-    // Pure resize (no data change): preserve user's current view
-    if (!isInitialUpdate && !pointsChanged && dimensionsChanged) {
-      if (zoom != null) {
-        const currentCenter = this.map.getCenter();
-        this.map.setView(
-          [lat ?? currentCenter.lat, lng ?? currentCenter.lng],
-          zoom,
-        );
-      }
-      // Don't reset to saved settings or recalculate on pure resize
-      return;
-    }
-
     // Initial update or data changed: apply saved settings if available
     if (
```

With the branch gone, a pure resize (dimensions changed, points unchanged) falls through to the saved-settings branch and calls `this.map.setView([centerLatitude, centerLongitude], settings["map.zoom"])`, snapping the view back to the saved zoom — the original bug.

### 2. Witness

Added to `frontend/src/metabase/visualizations/components/LeafletMap.unit.spec.tsx` — test `"should preserve the user's current zoom on a pure resize (metabase#11211)"`. It renders `LeafletMap` (jsdom) with saved settings `map.zoom: 4` and a `zoom` prop of `10` (the user's current zoom), spies on `map.setView` after mount, then rerenders with `width` 800→801 and the same `points` reference. Asserts `setView` is called with the user's zoom `10`, not the saved `4`.

Oracle command: `bun run test-unit-keep-cljs frontend/src/metabase/visualizations/components/LeafletMap.unit.spec.tsx -t "metabase#11211"`

- PASS on clean HEAD: `✓ ... (46 ms)`
- FAIL on mutant: `Expected: Anything, 10 / Received: [40, -100], 4` — proves the reverted code resets to the saved zoom.

### 3. Bug summary
On a map visualization with a saved center/zoom, when the container is resized (even by 1px, e.g. window/dashboard-card resize), the map jumps back to the saved zoom/center, discarding the zoom and pan the user had applied. The e2e repro zooms in 4 levels, nudges the viewport 800→801px, and asserts a marker's screen position stays within 5px.

### 4. Outcome
`witness_authored` — the bug is unit-catchable. The zoom-preservation decision is a pure JS branch in `syncMapFromProps` (props in → `setView(center, zoom)` out); the resize trigger is simulated by changing `width`/`height` props, and the observable (which zoom `setView` receives) is asserted via a spy in jsdom. No real browser measurement needed — the e2e's `getBoundingClientRect` pixel check is a proxy for exactly this `setView` argument. The e2e is replaceable by this unit test.

### 5. Confidence
High. The mutation is the exact inverse of the fix commit's product change (fix #67420), restoring the pre-fix control flow where resize-with-saved-settings resets the view. The witness discriminates cleanly (clean pass / mutant fail on a value assertion, not a compile error), and the received value on the mutant (`[40, -100], 4`) is literally the saved-settings reset path that the fix was written to avoid.