import type { RegisteredSeriesOption } from "echarts";
import type {
  ComputedVisualizationSettings,
  RenderingContext,
} from "metabase/visualizations/types";
import type { CartesianChartModel, ChartDataset } from "../model/types";
import { X_AXIS_DATA_KEY } from "../constants/dataset";

function getFirstNonNullXValue(dataset: ChartDataset) {
  for (let i = 0; i < dataset.length; i++) {
    const xValue = dataset[i][X_AXIS_DATA_KEY];

    if (xValue != null) {
      if (typeof xValue === "boolean") {
        return String(xValue); // convert bool to string since echarts doesn't support null as data value
      }
      return xValue;
    }
  }
  return String(null);
}

export function getGoalLineSeriesOption(
  chartModel: CartesianChartModel,
  settings: ComputedVisualizationSettings,
  renderingContext: RenderingContext,
): RegisteredSeriesOption["line"] | null {
  if (!settings["graph.show_goal"] || settings["graph.goal_value"] == null) {
    return null;
  }

  const lineStyle = {
    color: renderingContext.getColor("text-medium"),
    type: [5, 5],
    width: 2,
  };

  return {
    type: "line",
    data: [
      [getFirstNonNullXValue(chartModel.dataset), settings["graph.goal_value"]],
    ],
    lineStyle: {
      opacity: 0,
    },
    itemStyle: {
      opacity: 0,
    },
    // we hide the above line, it only exists to prevent the goal line from
    // rendering out of bounds
    markLine: {
      data: [{ name: "goal-line", yAxis: settings["graph.goal_value"] }],
      label: {
        position:
          chartModel.rightAxisModel == null ? "insideEndTop" : "insideStartTop",
        formatter: () => settings["graph.goal_label"] ?? "",
        fontFamily: renderingContext.fontFamily,
        fontSize: 14,
        fontWeight: 700,
        color: renderingContext.getColor("text-medium"),
        textBorderWidth: 1,
        textBorderColor: renderingContext.getColor("white"),
      },
      symbol: ["none", "none"],
      lineStyle,
      emphasis: {
        lineStyle,
      },
      blur: {
        lineStyle: {
          opacity: 1,
        },
        label: {
          opacity: 1,
        },
      },
    },
  };
}
