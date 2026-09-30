import Color from "color";

import {
  DEFAULT_METABASE_COMPONENT_THEME,
  type MantineThemeOther,
} from "metabase/ui";
import { color, staticVizOverrides } from "metabase/ui/colors";

import type { CartesianChartSize, VisualizationTheme } from "../../types";
import { CARTESIAN_CHART_BREAKPOINTS } from "../constants/layout";

import { getSizeInPx } from "./size-in-px";

function getPieBorderColor(
  dashboardCardBg: string,
  questionBg: string,
  isDashboard: boolean | undefined,
) {
  if (isDashboard) {
    return dashboardCardBg;
  }
  if (questionBg === "transparent") {
    return "var(--mb-color-background_page-primary)";
  }
  return questionBg;
}

const CARTESIAN_TICKS: Record<
  CartesianChartSize,
  VisualizationTheme["cartesian"]["ticks"]
> = {
  small: { fontSize: 12, marginX: 8, marginY: 12 },
  medium: { fontSize: 12, marginX: 8, marginY: 12 },
  large: { fontSize: 12, marginX: 8, marginY: 16 },
  fullscreen: { fontSize: 14, marginX: 12, marginY: 24 },
};

const CARTESIAN_AXIS_TITLE: Record<
  CartesianChartSize,
  VisualizationTheme["cartesian"]["axisTitle"]
> = {
  small: { fontSize: 11, fontWeight: 700, marginX: 8, marginY: 16 },
  medium: { fontSize: 12, fontWeight: 700, marginX: 12, marginY: 16 },
  large: { fontSize: 12, fontWeight: 700, marginX: 24, marginY: 24 },
  fullscreen: { fontSize: 14, fontWeight: 700, marginX: 40, marginY: 40 },
};

export function getCartesianChartSize(size?: {
  width: number;
  height: number;
}): CartesianChartSize {
  if (size === undefined) {
    return "fullscreen";
  }

  const { medium, large, fullscreen } = CARTESIAN_CHART_BREAKPOINTS;
  if (size.width >= fullscreen.width && size.height >= fullscreen.height) {
    return "fullscreen";
  }
  if (size.width >= large.width && size.height >= large.height) {
    return "large";
  }
  if (size.width >= medium.width && size.height >= medium.height) {
    return "medium";
  }
  return "small";
}

/**
 * Computes the visualization style from the Mantine theme.
 */
export function getVisualizationTheme({
  theme,
  isDashboard,
  cartesianSize = "fullscreen",
  isStaticViz,
}: {
  theme: Partial<MantineThemeOther>;
  isDashboard?: boolean;
  cartesianSize?: CartesianChartSize;
  isStaticViz?: boolean;
}): VisualizationTheme {
  const { cartesian, dashboard, question } = theme;
  if (cartesian == null || dashboard == null || question == null) {
    throw Error("Missing required theme values");
  }

  // This allows sdk users to set the base font size,
  // which scales the visualization's font sizes.
  const baseFontSize = getSizeInPx(theme.fontSize);

  // ECharts requires font sizes in px for offset calculations.
  const px = (value: string) =>
    getSizeInPx(value, baseFontSize) ?? baseFontSize ?? 14;

  const ticks = CARTESIAN_TICKS[cartesianSize];
  const axisTitle = CARTESIAN_AXIS_TITLE[cartesianSize];

  return {
    cartesian: {
      label: { fontSize: px(cartesian.label.fontSize) },
      ticks: {
        ...ticks,
        fontSize: theme.hasCustomChartFontSize
          ? px(cartesian.label.fontSize)
          : ticks.fontSize,
      },
      axisTitle: {
        ...axisTitle,
        fontSize: theme.hasCustomChartFontSize
          ? px(cartesian.label.fontSize)
          : axisTitle.fontSize,
      },
      goalLine: {
        label: { fontSize: px(cartesian.goalLine.label.fontSize) },
      },
      splitLine: {
        lineStyle: {
          color: isStaticViz
            ? Color(staticVizOverrides["chart-axis"]).hex()
            : cartesian.splitLine.lineStyle.color,
        },
      },
    },
    pie: {
      borderColor: isStaticViz
        ? Color(color("text-primary-inverse")).hex()
        : getPieBorderColor(
            dashboard.card.backgroundColor,
            question.backgroundColor,
            isDashboard,
          ),
    },
  };
}

export const DEFAULT_VISUALIZATION_THEME = getVisualizationTheme({
  theme: DEFAULT_METABASE_COMPONENT_THEME,
  isStaticViz: true,
});
