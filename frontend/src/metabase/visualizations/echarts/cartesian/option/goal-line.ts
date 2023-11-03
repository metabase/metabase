import type {
  ComputedVisualizationSettings,
  RenderingContext,
} from "metabase/visualizations/types";

export function getGoalLineEChartsSeries(
  settings: ComputedVisualizationSettings,
  renderingContext: RenderingContext,
) {
  return {
    type: "line",
    markLine: {
      data: [{ name: "goal-line", yAxis: settings["graph.goal_value"] }], // todo, how does this work with normalization?
      label: {
        position: "insideEndTop",
        formatter: () => settings["graph.goal_label"],
        fontFamily: renderingContext.fontFamily,
        fontSize: 14,
        fontWeight: 700,
        color: renderingContext.getColor("text-medium"),
        textBorderWidth: 1,
        textBorderColor: renderingContext.getColor("white"),
      },
      symbol: ["none", "none"],
      lineStyle: {
        color: renderingContext.getColor("text-medium"),
        type: [5, 5],
        width: 2,
      },
    },
  };
}
