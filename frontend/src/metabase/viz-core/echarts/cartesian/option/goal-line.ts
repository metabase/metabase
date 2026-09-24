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

export const GOAL_LINE_DASH = [2, 2];
const GOAL_LINE_WIDTH = 1;

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
  const {
    outerRingRadius,
    innerRingRadius,
    ringWidth,
    backgroundRadius,
    shadowSpread,
    hitAreaRadius,
  } = CHART_STYLE.goalLine.marker;
  const iconColor = renderingContext.getColor("icon-primary");

  const circle = (
    r: number,
    style: { fill: string; stroke?: string; lineWidth?: number },
  ) => ({
    type: "circle" as const,
    shape: { cx: xEnd, cy: y, r },
    silent: true,
    blur: {
      style: {
        opacity: 1,
      },
    },
    emphasis: {
      style: { ...style },
    },
    style,
  });

  const shadow = circle(backgroundRadius + shadowSpread, {
    fill: renderingContext.getColor("shadow-default"),
  });
  const background = circle(backgroundRadius, {
    fill: renderingContext.getColor("background_surface-primary"),
  });
  const hoverBackground = {
    ...circle(backgroundRadius, { fill: "none" }),
    emphasis: {
      style: {
        fill: renderingContext.getColor("background_surface-primary-hover"),
      },
    },
  };
  const ringStyle = { fill: "none", stroke: iconColor, lineWidth: ringWidth };

  const hitArea = {
    type: "circle" as const,
    shape: { cx: xEnd, cy: y, r: hitAreaRadius },
    style: {
      fill: iconColor,
      opacity: 0,
    },
  };

  return [
    shadow,
    background,
    hoverBackground,
    circle(outerRingRadius, ringStyle),
    circle(innerRingRadius, ringStyle),
    hitArea,
  ];
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
      // Snapped to the pixel grid so the line and its shadow below stay crisp
      // instead of being anti-aliased into each other.
      const lineY = Math.round(y - GOAL_LINE_WIDTH / 2) + GOAL_LINE_WIDTH / 2;

      const getLine = (offsetY: number, stroke: string) => ({
        type: "line" as const,
        shape: {
          x1: Math.round(xStart),
          x2: xEnd,
          y1: lineY + offsetY,
          y2: lineY + offsetY,
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
        : buildGoalLineMarker({ xEnd, y: lineY, renderingContext });

      return {
        type: "group" as const,
        children: [lineShadow, line, ...endDecoration],
      };
    },
  };
}
