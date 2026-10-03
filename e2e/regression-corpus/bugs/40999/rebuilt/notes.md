# 40999: pin map "Pin type" setting hidden

## Where the code moved
The fix (6a3d185b2b2) uncommented `widget: "select"` on the pin type setting in
`Map/Map.jsx`. By July that was `Map/Map.tsx`, keyed `"map.pin_type"`. At
8317274709c, `Map.tsx` is only a memo wrapper, and the whole viz definition lives in
`frontend/src/metabase/visualizations/visualizations/Map/definition.tsx`
(`MAP_VIZ_DEFINITION.settings["map.pin_type"]`, line 110). That's why July's patch
conflicts.

## Mutant
Delete the `widget: "select",` line from `map.pin_type`. This is the pre-fix state
minus July's "Don't expose this in the UI for now" comment, because the rebuilt mutants
carry no comments. `getSettingsWidgets` in `metabase/viz-core/lib/widgets.ts` ends
with `.filter((widget) => widget.widget)`, so a setting without a widget never reaches
the chart settings sidebar. The user can't see Pin type or switch a large pin map
(which defaults to tiles) to markers, which is `bug.statement`. `PinMap.unit.spec.tsx`
still passes on the mutant (16 tests), so the module loads fine.

## Oracle (July witness, adapted)
New file `Map/Map.unit.spec.ts`. The file and test names match the record's hint.
Changes from July's version:
- Imports `MAP_VIZ_DEFINITION` from `./definition` instead of `Map` from `./Map`, so
  jest doesn't need to load leaflet.
- Calls `registerVisualizations()`. String widget keys now resolve through the viz-core
  registry (`getSettingWidgetComponent`). Without registration, `"select"` resolves to
  undefined and the test would fail on clean HEAD too.
- Uses a mock card/data series.
- Adds a `toMatchObject` check that the widget has `hidden: false` and a `markers`
  option. This mirrors the e2e, which checks that Pin type is visible and then picks
  Markers.

Clean: `PASS core .../Map/Map.unit.spec.ts ✓ should expose the 'Pin type' setting ...`
Mutant:
```
expect(received).toContain(expected) // indexOf
Expected value: "map.pin_type"
Received array: []
  > 29 | expect(widgets.map((widget) => widget.id)).toContain("map.pin_type");
```

## Adversarial check
Nothing renders. The test is a pure call to `getSettingsWidgets` with one definition
and fixed computed settings, so a failure can't come from a React or leaflet crash.
The only difference between clean and mutant is the `widget` property, and the failing
assertion is the id list going from `["map.pin_type"]` to `[]`, which is exactly what
the filter does to a widget-less definition. The first assertion runs before any
lookup, so a missing widget fails as an assertion, not as a TypeError.

## Variants
- v1: `getHidden` inverted (no `!`), so Pin type is hidden for pin maps. Killed:
  `hidden` true vs false.
- v2: Markers option removed from `getProps`. Killed: options array has no `markers`.
- v3: tiles/markers default swapped at the 1000-row threshold. Survives. The witness
  passes computed settings directly, so `getDefault` never runs.

## Gotchas
- Without `registerVisualizations()` the widget registry is empty and the witness fails
  on clean HEAD. No cljs involved; the `target` symlink was not touched.
