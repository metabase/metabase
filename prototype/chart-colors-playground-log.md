# Chart colors playground

## Brief
Tune the colors of charts live in the running app. The panel lists every color the charts on screen use, in HSL, and lets you change them one at a time or all at once (batch mode). The question: which palette adjustments (lighter, less saturated, shifted hue) read better across real charts?

Try it: any saved question with a chart (`/question/<id>`), or a dashboard. Panel: top right, ⌥L shows as shipped, ⌥P hides.

## Knobs

The color folders are built from the charts on screen, so there is no fixed list.

| Folder | Knob | Drives | Shipped | Range |
| --- | --- | --- | --- | --- |
| General | Show as shipped (⌥L) | Removes every override | off | — |
| Batch edit | Batch mode | Turns the three offsets below on | off | — |
| Batch edit | Hue ± | Added to every color's hue (wraps around) | 0 | −180–180 |
| Batch edit | Saturation ± | Added to every color's saturation (clamped to 0–100) | 0 | −100–100 |
| Batch edit | Lightness ± | Added to every color's lightness (clamped to 0–100) | 0 | −100–100 |
| Batch edit | Apply offsets to each color | Writes the offsets into each color's own sliders, then zeroes them | — | — |
| Colors › `#RRGGBB` | Swatch (labelled with the series that use it) | The color's own value. The field shows hex; type any hex or `hsl(…)` value, or use the picker | the chart's color | — |
| Colors › `#RRGGBB` | Hue / Saturation / Lightness | That color's own HSL | the chart's color | 0–359 / 0–100 / 0–100 |
| Actions | Copy changes as JSON | Colors that differ from shipped: used by, shipped hex + HSL, new hex + HSL | — | — |
| Actions | Reset to shipped | Every color and offset back to shipped | — | — |

How it works: overrides are keyed by the shipped color. Changing `#509EE3` changes it in every chart on screen, and the change is remembered (local storage) for any other chart that uses it.

## Hooks into production code
Every edit outside `frontend/src/metabase/chart-colors-playground/`, so they can be reverted in one pass.
- `frontend/src/metabase/visualizations/components/Visualization/Visualization.tsx` (marked `PLAYGROUND`): the computed settings go through `applyColorOverrides` before they reach the chart; the wrapper reads `useColorOverrides()` so charts re-render on a change; `componentWillUnmount` calls `forgetChartColors`.
- `frontend/src/metabase/app.tsx`: mounts `<ChartColorsPlayground />`, imports `leva-csp`.
- `frontend/lint/module-boundaries.mjs`: registers the `chart-colors-playground` folder.
- `package.json`, `bun.lock`: adds `leva`.

## Findings
- (none yet)

## Known limits
- Not yet checked against a real chart (2026-11-26): the panel was tested in the browser with made-up chart settings, because there was no login for the dev instance. Check a line or bar chart and a pie first.
- In batch mode the swatches and sliders keep showing each color's own value, not the value with the offsets added. "Apply offsets to each color" writes them in.
- Only colors that live in a chart's computed settings follow the panel: series colors of line, bar, area, combo, row, scatter and waterfall charts, pie slices, gauge and progress colors, table conditional formatting. Colors a chart picks inside its own model don't appear: sankey nodes, treemap groups, and anything read straight from the theme (axes, labels, grid lines, goal lines).
- HSL values are whole numbers. A color at shipped values draws the exact shipped hex; once changed, it's rounded to the nearest whole H, S and L.
- The chart settings sidebar still shows the saved colors, not the playground's.
- Anything rendered outside the app's `Visualization` component (static-viz in emails and exports) is untouched.
