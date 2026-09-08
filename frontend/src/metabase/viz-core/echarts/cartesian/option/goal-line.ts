import type { CustomSeriesOption } from "echarts/charts";

import type { RowValue } from "metabase-types/api";

import type {
  ComputedVisualizationSettings,
  RenderingContext,
} from "../../../types";
import type { EChartsCartesianCoordinateSystem } from "../../types";
import { GOAL_LINE_SERIES_ID, X_AXIS_DATA_KEY } from "../constants/dataset";
import { CHART_STYLE, Z_INDEXES } from "../constants/style";
import type { ChartDataset } from "../model/types";

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

export interface GoalLineParams {
  dataset: ChartDataset;
  isNormalized: boolean;
  toEChartsAxisValue: (value: RowValue) => number | null;
  labelOnLeft: boolean;
  /**
   * Row charts put the metric on the horizontal axis, so the goal is an
   * x-coordinate and the line runs vertically — the transpose of every other
   * cartesian chart.
   */
  isRowChart?: boolean;
}

interface GoalLineParamsSource {
  dataset: ChartDataset;
  leftAxisModel: { isNormalized?: boolean } | null;
  rightAxisModel: unknown;
  yAxisScaleTransforms: {
    toEChartsAxisValue: (value: RowValue) => number | null;
  };
}

export function getGoalLineParams(model: GoalLineParamsSource): GoalLineParams {
  return {
    dataset: model.dataset,
    isNormalized: model.leftAxisModel?.isNormalized ?? false,
    toEChartsAxisValue: model.yAxisScaleTransforms.toEChartsAxisValue,
    labelOnLeft: model.rightAxisModel != null,
  };
}

export function getGoalLineSeriesOption(
  {
    dataset,
    isNormalized,
    toEChartsAxisValue,
    labelOnLeft,
    isRowChart = false,
  }: GoalLineParams,
  settings: ComputedVisualizationSettings,
  renderingContext: RenderingContext,
): CustomSeriesOption | null {
  if (!settings["graph.show_goal"] || settings["graph.goal_value"] == null) {
    return null;
  }

  const value = isNormalized
    ? settings["graph.goal_value"] / 100
    : settings["graph.goal_value"];

  const scaleTransformedGoalValue = toEChartsAxisValue(value);
  const { fontSize } = renderingContext.theme.cartesian.goalLine.label;

  return {
    id: GOAL_LINE_SERIES_ID,
    type: "custom",
    // The datum only anchors the series to the coordinate system; which slot
    // holds the goal depends on which axis carries the metric.
    data: [
      isRowChart
        ? [scaleTransformedGoalValue, getFirstNonNullXValue(dataset)]
        : [getFirstNonNullXValue(dataset), scaleTransformedGoalValue],
    ],
    z: Z_INDEXES.goalLine,
    blur: {
      opacity: 1,
    },
    renderItem: (params, api) => {
      const coordSys =
        // Unjustified type cast. FIXME
        params.coordSys as unknown as EChartsCartesianCoordinateSystem;
      const xStart = coordSys.x;
      const xEnd = coordSys.width + coordSys.x;
      const yStart = coordSys.y;
      const yEnd = coordSys.height + coordSys.y;

      // Rotated: the goal is a position along x and the line spans the plot
      // vertically. Upright: the reverse.
      const [goalX] = api.coord([scaleTransformedGoalValue, null]);
      const [, goalY] = api.coord([null, scaleTransformedGoalValue]);

      const shape = isRowChart
        ? { x1: goalX, x2: goalX, y1: yStart, y2: yEnd }
        : { x1: xStart, x2: xEnd, y1: goalY, y2: goalY };

      const line = {
        type: "line" as const,
        shape,
        blur: {
          style: {
            opacity: 1,
          },
        },
        style: {
          lineWidth: 2,
          stroke: renderingContext.getColor("text-secondary"),
          color: renderingContext.getColor("text-secondary"),
          lineDash: GOAL_LINE_DASH,
        },
      };

      // Upright, the label sits above the line at one end. Rotated, it sits
      // above the top of the line — flipping to the left of it when the goal is
      // close enough to the right edge that a right-aligned label would spill
      // outside the plot, which is what the legacy renderer did.
      const labelMargin = CHART_STYLE.goalLine.label.margin;
      const labelWidth =
        (settings["graph.goal_label"] ?? "").length * fontSize * 0.6;
      const flipLabel = isRowChart && goalX + labelWidth > xEnd;

      const align = isRowChart
        ? flipLabel
          ? ("right" as const)
          : ("left" as const)
        : labelOnLeft
          ? ("left" as const)
          : ("right" as const);
      const labelX = isRowChart ? goalX : labelOnLeft ? xStart : xEnd;
      const labelY = isRowChart
        ? yStart - fontSize - labelMargin
        : goalY - fontSize - labelMargin;

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
          fill: renderingContext.getColor("text-secondary"),
        },
      };

      return {
        type: "group" as const,
        children: [line, label],
      };
    },
  };
}
