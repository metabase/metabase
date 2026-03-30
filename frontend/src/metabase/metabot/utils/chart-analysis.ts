import type { VisualizationDisplay } from "metabase-types/api";

const CHART_ANALYSIS_ENABLED = {
  // enabled
  area: true,
  bar: true,
  boxplot: true,
  combo: true,
  funnel: true,
  gauge: true,
  line: true,
  map: true,
  pie: true,
  progress: true,
  row: true,
  sankey: true,
  scatter: true,
  waterfall: true,
  // disabled
  action: false,
  heading: false,
  iframe: false,
  link: false,
  object: false,
  pivot: false,
  placeholder: false,
  scalar: false,
  smartscalar: false,
  table: false,
  text: false,
  list: false,
} as const satisfies { [display in VisualizationDisplay]: boolean };

type EnabledChartTypes = {
  [K in keyof typeof CHART_ANALYSIS_ENABLED]: (typeof CHART_ANALYSIS_ENABLED)[K] extends true
    ? K
    : never;
}[keyof typeof CHART_ANALYSIS_ENABLED];

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
  waterfall: "svg",
} as const satisfies { [display in EnabledChartTypes]: "png" | "svg" | "none" };

export const canAnalyzeQuestion = (display: VisualizationDisplay) => {
  return CHART_ANALYSIS_ENABLED[display] ?? false;
};
