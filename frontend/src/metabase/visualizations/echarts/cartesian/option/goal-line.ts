import type { CustomSeriesOption } from "echarts/charts";

import type {
  ComputedVisualizationSettings,
  RenderingContext,
} from "metabase/visualizations/types";

import type { EChartsCartesianCoordinateSystem } from "../../types";
import { GOAL_LINE_SERIES_ID, X_AXIS_DATA_KEY } from "../constants/dataset";
import { CHART_STYLE } from "../constants/style";
import type { ChartDataset, CartesianChartModel } from "../model/types";

export const GOAL_LINE_DASH = [3, 4];

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
): CustomSeriesOption | null {
  if (!settings["graph.show_goal"] || settings["graph.goal_value"] == null) {
    return null;
  }

  const goalValue = settings["graph.goal_value"];
  const { fontSize } = renderingContext.theme.cartesian.goalLine.label;

  return {
    id: GOAL_LINE_SERIES_ID,
    type: "custom",
    data: [
      [getFirstNonNullXValue(chartModel.dataset), settings["graph.goal_value"]],
    ],
    z: CHART_STYLE.goalLine.zIndex,
    blur: {
      opacity: 1,
    },
    renderItem: (params, api) => {
      const [_x, y] = api.coord([null, goalValue]);
      const coordSys =
        params.coordSys as unknown as EChartsCartesianCoordinateSystem;
      const xStart = coordSys.x;
      const xEnd = coordSys.width + coordSys.x;

      const line = {
        type: "line" as const,
        shape: {
          x1: xStart,
          x2: xEnd,
          y1: y,
          y2: y,
        },
        blur: {
          style: {
            opacity: 1,
          },
        },
        style: {
          lineWidth: 2,
          stroke: renderingContext.getColor("text-medium"),
          color: renderingContext.getColor("text-medium"),
          lineDash: GOAL_LINE_DASH,
        },
      };

      const hasRightYAxis = chartModel.rightAxisModel == null;
      const align = hasRightYAxis ? ("right" as const) : ("left" as const);
      const labelX = hasRightYAxis ? xEnd : xStart;
      const labelY = y - fontSize - CHART_STYLE.goalLine.label.margin;

      const label = {
        type: "text" as const,
        x: labelX,
        y: labelY,
        blur: {
          style: {
            opacity: 1,
          },
        },
        style: {
          align,
          text: settings["graph.goal_label"] ?? "",
          fontFamily: renderingContext.fontFamily,
          fontSize,
          fontWeight: CHART_STYLE.goalLine.label.weight,
          fill: renderingContext.getColor("text-medium"),
        },
      };

      return {
        type: "group" as const,
        children: [line, label],
      };
    },
  };
}
