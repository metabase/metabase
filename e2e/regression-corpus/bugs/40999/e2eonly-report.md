Both the product mutation and the witness are in place. Task complete.

## Report

### 1. git diff (product mutation)
Semantic revert of fix commit `6a3d185b` in `frontend/src/metabase/visualizations/visualizations/Map/Map.tsx` (the fix's `Map.jsx` drifted to `Map.tsx`; the setting key drifted from an inline `pin type` to `"map.pin_type"`):

```diff
       get title() {
         return t`Pin type`;
       },
-      widget: "select",
+      // Don't expose this in the UI for now
+      // widget: "select",
       getProps: () => ({
```

This exactly re-creates the pre-fix state (the original commit uncommented that same `widget: "select"` line).

### 2. Witness
Added `frontend/src/metabase/visualizations/visualizations/Map/Map.unit.spec.ts` (new file). It exercises the real production `Map.settings["map.pin_type"]` definition through the real `getSettingsWidgets` seam, which filters out any setting whose `widget` is falsy (`.filter((widget) => widget.widget)` in `settings.ts:257`):

```ts
import { getSettingsWidgets } from "metabase/visualizations/lib/settings";
import { Map } from "./Map";

describe("Map viz settings (metabase#40999)", () => {
  it("should expose the 'Pin type' setting as an editable widget", () => {
    const defs = { "map.pin_type": Map.settings["map.pin_type"] };
    const computedSettings = { "map.type": "pin" };
    const widgets = getSettingsWidgets(defs, {}, computedSettings,
      [{ data: { rows: [], cols: [] } }], () => {});
    expect(widgets.map((w) => w.id)).toContain("map.pin_type");
  });
});
```

Oracle command: `bun run test-unit-keep-cljs frontend/src/metabase/visualizations/visualizations/Map/Map.unit.spec.ts`
- PASS on clean HEAD (widget present).
- FAIL on mutant: `expect(received).toContain(expected)` — Expected value `"map.pin_type"`, Received array `[]` (the setting is filtered out because it has no `widget`).

Both the mutation and the witness are left applied in the worktree.

### 3. Bug summary
Without `widget: "select"`, the "Pin type" map setting has no widget, so `getSettingsWidgets` drops it and it never renders in the chart-settings left sidebar. Users can't switch a pin map between Tiles / Markers / Grid rendering. The e2e repro opens viz settings, expects "Pin type" to be visible, selects "Markers", and asserts `.leaflet-marker-icon` elements appear — none of which is reachable when the widget is hidden.

### 4. Outcome
`witness_authored` — the bug is unit-catchable. The observable (a setting appearing as an editable widget) lives in a pure function `getSettingsWidgets` whose filtering behavior is fully exercisable in jsdom without rendering Leaflet, so the e2e is replaceable at the unit level.

### 5. Confidence
High. The mutation is byte-for-byte the inverse of the fix commit's product change, applied at the drifted location. The witness discriminates purely on the mutated property via the same seam the real settings sidebar uses (definition → `getSettingsWidgets` → `.filter(w => w.widget)`), and empirically flips PASS→FAIL on exactly this edit with a clean value assertion (no compile error).