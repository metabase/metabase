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

export const GOAL_LINE_DASH = [1, 3];

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

function buildGoalLineLabel({
  labelOnLeft,
  xStart,
  xEnd,
  y,
  fontSize,
  settings,
  renderingContext,
}: {
  labelOnLeft: boolean;
  xStart: number;
  xEnd: number;
  y: number;
  fontSize: number;
  settings: ComputedVisualizationSettings;
  renderingContext: RenderingContext;
}) {
  return [
    {
      type: "text" as const,
      x: labelOnLeft ? xStart : xEnd,
      y: y - fontSize - CHART_STYLE.goalLine.label.margin,
      blur: {
        style: {
          opacity: 1,
        },
      },
      style: {
        align: labelOnLeft ? ("left" as const) : ("right" as const),
        text: settings["graph.goal_label"] ?? "",
        fontFamily: renderingContext.fontFamily,
        fontSize,
        fontWeight: CHART_STYLE.goalLine.label.weight,
        fill: renderingContext.getColor("text-secondary"),
      },
    },
  ];
}

function buildGoalLineMarker({
  xEnd,
  y,
  renderingContext,
}: {
  xEnd: number;
  y: number;
  renderingContext: RenderingContext;
}) {
  const { outerRingRadius, innerRingRadius, ringWidth, hitAreaRadius } =
    CHART_STYLE.goalLine.marker;
  const stroke = renderingContext.getColor("text-primary");

  const ring = (r: number) => ({
    type: "circle" as const,
    shape: { cx: xEnd, cy: y, r },
    silent: true,
    blur: {
      style: {
        opacity: 1,
      },
    },
    style: {
      fill: "none",
      stroke,
      lineWidth: ringWidth,
    },
  });

  // Sits on top so hovering anywhere near the marker, not just on the thin
  // rings, triggers the goal tooltip. A zero-opacity fill keeps it invisible
  // while staying hit-testable; ECharts renders a "transparent" fill as
  // fill="none", which receives no pointer events.
  const hitArea = {
    type: "circle" as const,
    shape: { cx: xEnd, cy: y, r: hitAreaRadius },
    style: {
      fill: stroke,
      opacity: 0,
    },
  };

  return [ring(outerRingRadius), ring(innerRingRadius), hitArea];
}

export function getGoalLineSeriesOption(
  { dataset, isNormalized, toEChartsAxisValue, labelOnLeft }: GoalLineParams,
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
    data: [[getFirstNonNullXValue(dataset), scaleTransformedGoalValue]],
    z: Z_INDEXES.goalLine,
    blur: {
      opacity: 1,
    },
    renderItem: (params, api) => {
      const [_x, y] = api.coord([null, scaleTransformedGoalValue]);
      const coordSys =
        // Unjustified type cast. FIXME
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
        // Only the marker is a hover target, so the line itself is inert.
        silent: true,
        blur: {
          style: {
            opacity: 1,
          },
        },
        style: {
          lineWidth: 1,
          stroke: renderingContext.getColor("text-secondary"),
          color: renderingContext.getColor("text-secondary"),
          lineDash: GOAL_LINE_DASH,
        },
      };

      // Static renders have no hover, so they keep the inline label to stay
      // readable. Interactive charts show the marker and reveal the value on
      // hover instead.
      const endDecoration = renderingContext.isStatic
        ? buildGoalLineLabel({
            labelOnLeft,
            xStart,
            xEnd,
            y,
            fontSize,
            settings,
            renderingContext,
          })
        : buildGoalLineMarker({ xEnd, y, renderingContext });

      return {
        type: "group" as const,
        children: [line, ...endDecoration],
      };
    },
  };
}
