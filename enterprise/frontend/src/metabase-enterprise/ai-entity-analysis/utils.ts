import type { VisualizationDisplay } from "metabase-types/api";

export const canAnalyzeQuestion = (display: VisualizationDisplay) => {
  return [
    "bar",
    "line",
    "pie",
    "row",
    "area",
    "combo",
    "smartscalar",
    "gauge",
    "progress",
    "funnel",
    "map",
    "scatter",
    "waterfall",
    "sankey",
  ].includes(display);
};
