import { DEFAULT_METABASE_COMPONENT_THEME } from "embedding-sdk/lib/theme";
import { color } from "metabase/lib/colors";
import type { MantineThemeOther } from "metabase/ui";
import { getSizeInPx } from "metabase/visualizations/shared/utils/size-in-px";
import type { VisualizationTheme } from "metabase/visualizations/types";

function getPieBorderColor(
  dashboardCardBg: string,
  questionBg: string,
  isDashboard: boolean | undefined,
  isNightMode: boolean | undefined,
) {
  if (isDashboard && isNightMode) {
    return "var(--mb-color-bg-night)";
  }
  if (isDashboard) {
    return dashboardCardBg;
  }
  if (questionBg === "transparent") {
    return "var(--mb-color-bg-white)";
  }
  return questionBg;
}

/**
 * Computes the visualization style from the Mantine theme.
 */
export function getVisualizationTheme({
  theme,
  isDashboard,
  isNightMode,
  isStaticViz,
}: {
  theme: Partial<MantineThemeOther>;
  isDashboard?: boolean;
  isNightMode?: boolean;
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

  return {
    cartesian: {
      label: { fontSize: px(cartesian.label.fontSize) },
      goalLine: {
        label: { fontSize: px(cartesian.goalLine.label.fontSize) },
      },
    },
    pie: {
      borderColor: isStaticViz
        ? color("text-white")
        : getPieBorderColor(
            dashboard.card.backgroundColor,
            question.backgroundColor,
            isDashboard,
            isNightMode,
          ),
    },
  };
}

export const DEFAULT_VISUALIZATION_THEME = getVisualizationTheme({
  theme: DEFAULT_METABASE_COMPONENT_THEME,
  isStaticViz: true,
});
