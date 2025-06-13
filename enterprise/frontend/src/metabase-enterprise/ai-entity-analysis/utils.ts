import type { VisualizationDisplay } from "metabase-types/api";

const CHART_ANALYSIS_ENABLED: { [type in VisualizationDisplay]: boolean } = {
  // enabled
  area: true,
  bar: true,
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
};

export const canAnalyzeQuestion = (display: VisualizationDisplay) => {
  return CHART_ANALYSIS_ENABLED[display] ?? false;
};
