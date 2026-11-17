import type { CustomSeriesOption } from "echarts/charts";

import type {
  ComputedVisualizationSettings,
  RenderingContext,
} from "../../../../types";
import type { EChartsCartesianCoordinateSystem } from "../../../types";
import { GOAL_LINE_SERIES_ID } from "../../constants/dataset";
import { CHART_STYLE, Z_INDEXES } from "../../constants/style";
import {
  GOAL_LINE_DASH,
  GOAL_LINE_WIDTH,
  type GoalLineParams,
  buildGoalLineMarker,
  getFirstNonNullXValue,
  getGoalLineValue,
} from "../../option/goal-line";

// Row charts: the goal is an x-coordinate and the line runs vertically.
export function getRowGoalLineSeriesOption(
  {
    dataset,
    isNormalized,
    toEChartsAxisValue,
  }: Pick<GoalLineParams, "dataset" | "isNormalized" | "toEChartsAxisValue">,
  settings: ComputedVisualizationSettings,
  renderingContext: RenderingContext,
): CustomSeriesOption | null {
  if (!settings["graph.show_goal"] || settings["graph.goal_value"] == null) {
    return null;
  }

  const scaleTransformedGoalValue = getGoalLineValue(
    settings["graph.goal_value"],
    { isNormalized, toEChartsAxisValue },
  );
  const { fontSize } = renderingContext.theme.cartesian.goalLine.label;
  const labelText = settings["graph.goal_label"] ?? "";
  const labelWidth = renderingContext.measureText(labelText, {
    family: renderingContext.fontFamily,
    size: fontSize,
    weight: CHART_STYLE.goalLine.label.weight,
  });

  return {
    id: GOAL_LINE_SERIES_ID,
    type: "custom",
    data: [[scaleTransformedGoalValue, getFirstNonNullXValue(dataset)]],
    z: Z_INDEXES.goalLine,
    blur: {
      opacity: 1,
    },
    renderItem: (params, api) => {
      const coordSys =
        // ECharts types coordSys as `{ type }`; a cartesian series gets the grid rect.
        params.coordSys as unknown as EChartsCartesianCoordinateSystem;
      const [goalX] = api.coord([scaleTransformedGoalValue, null]);
      const xEnd = coordSys.width + coordSys.x;
      const yStart = coordSys.y;
      const yEnd = coordSys.height + coordSys.y;
      // Snapped to the pixel grid so the line and its shadow beside it stay crisp.
      const lineX =
        Math.round(goalX - GOAL_LINE_WIDTH / 2) + GOAL_LINE_WIDTH / 2;

      const getLine = (offsetX: number, stroke: string) => ({
        type: "line" as const,
        shape: {
          x1: lineX + offsetX,
          x2: lineX + offsetX,
          y1: yStart,
          y2: Math.round(yEnd),
        },
        // Only the marker is a hover target, so the line itself is inert.
        silent: true,
        blur: {
          style: {
            opacity: 1,
          },
        },
        emphasis: {
          style: {
            stroke,
          },
        },
        style: {
          lineWidth: GOAL_LINE_WIDTH,
          stroke,
          color: stroke,
          lineDash: GOAL_LINE_DASH,
        },
      });

      const line = getLine(0, renderingContext.getColor("icon-primary"));
      const lineShadow = getLine(
        GOAL_LINE_WIDTH,
        renderingContext.getColor("background_surface-primary"),
      );

      // Static renders keep the label above the line, flipped left near the
      // right edge; interactive ones get the marker.
      const endDecoration = renderingContext.isStatic
        ? [
            {
              type: "text" as const,
              x: lineX,
              y: yStart - fontSize - CHART_STYLE.goalLine.label.margin,
              blur: {
                style: {
                  opacity: 1,
                },
              },
              style: {
                align:
                  lineX + labelWidth > xEnd
                    ? ("right" as const)
                    : ("left" as const),
                text: labelText,
                fontFamily: renderingContext.fontFamily,
                fontSize,
                fontWeight: CHART_STYLE.goalLine.label.weight,
                fill: renderingContext.getColor("text-secondary"),
              },
            },
          ]
        : buildGoalLineMarker({ xEnd: lineX, y: yStart, renderingContext });

      return {
        type: "group" as const,
        children: [lineShadow, line, ...endDecoration],
      };
    },
  };
}
