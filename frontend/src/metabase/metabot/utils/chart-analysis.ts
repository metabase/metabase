import type { VisualizationDisplay } from "metabase-types/api";

// SVG renderer is faster + preferred, since it clones the existing SVG DOM node. However, in the
// following cases we need to fallback to the slower PNG approach:
// - the chart isn't an SVG (progress)
// - the chart is composed of more than one svg (funnel)
// - the chart contain important info outside of the svg (pie + map)
export const CHART_ANALYSIS_RENDER_FORMATS = {
  area: "svg",
  bar: "svg",
  boxplot: "svg",
  combo: "svg",
  funnel: "png",
  gauge: "svg",
  line: "svg",
  map: "png",
  pie: "png",
  progress: "png",
  row: "svg",
  sankey: "svg",
  scatter: "svg",
  treemap: "svg",
  waterfall: "svg",
} as const satisfies Partial<
  Record<VisualizationDisplay, "png" | "svg" | "none">
>;
