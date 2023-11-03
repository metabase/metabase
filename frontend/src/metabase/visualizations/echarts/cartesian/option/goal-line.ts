import type { RegisteredSeriesOption } from "echarts";
import type {
  ComputedVisualizationSettings,
  RenderingContext,
} from "metabase/visualizations/types";

export function getGoalLineEChartsSeries(
  settings: ComputedVisualizationSettings,
  renderingContext: RenderingContext,
): RegisteredSeriesOption["line"] | null {
  if (!settings["graph.show_goal"]) {
    return null;
  }

  return {
    type: "line",
    markLine: {
      data: [{ name: "goal-line", yAxis: settings["graph.goal_value"] }],
      label: {
        position: "insideEndTop",
        formatter: () => settings["graph.goal_label"] ?? "",
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
