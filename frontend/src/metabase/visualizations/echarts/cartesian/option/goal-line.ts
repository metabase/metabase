import type { RegisteredSeriesOption } from "echarts";
import type {
  ComputedVisualizationSettings,
  RenderingContext,
} from "metabase/visualizations/types";
import type { CartesianChartModel } from "../model/types";

export function getGoalLineSeriesOption(
  chartModel: CartesianChartModel,
  settings: ComputedVisualizationSettings,
  renderingContext: RenderingContext,
): RegisteredSeriesOption["line"] | null {
  if (!settings["graph.show_goal"]) {
    return null;
  }
  const [_leftAxisKeys, rightAxisKeys] = chartModel.yAxisSplit;

  return {
    type: "line", // type is irreelevant since we don't render any series data
    data: [],
    silent: true,
    markLine: {
      data: [{ name: "goal-line", yAxis: settings["graph.goal_value"] }],
      label: {
        position:
          rightAxisKeys.length === 0 ? "insideEndTop" : "insideStartTop",
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
