import "metabase/static-viz/polyfill";

import { getCellBackgroundColors, renderChart } from "metabase/static-viz";

// Object-in / object-out. Used by the Node renderer (metabase.channel.render.js.node), which passes JS
// objects and serializes once at the process boundary — no per-call JSON round-trip inside the bundle.
export { getCellBackgroundColors, renderChart };

// JSON-string-in / JSON-string-out. Used by the GraalVM renderer, which passes strings across the
// polyglot boundary.
export function renderChartJSON(inputJSON: string): string {
  return JSON.stringify(renderChart(JSON.parse(inputJSON)));
}

export function getCellBackgroundColorsJSON(inputJSON: string): string {
  return JSON.stringify(getCellBackgroundColors(JSON.parse(inputJSON)));
}
