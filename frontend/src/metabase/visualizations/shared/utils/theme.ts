import { DEFAULT_METABASE_COMPONENT_THEME } from "embedding-sdk/lib/theme";
import type { MantineThemeOther } from "metabase/ui";
import { getSizeInPx } from "metabase/visualizations/shared/utils/size-in-px";
import type { VisualizationTheme } from "metabase/visualizations/types";

/**
 * Computes the visualization style from the Mantine theme.
 */
export function getVisualizationTheme(
  options: MantineThemeOther,
): VisualizationTheme {
  const { cartesian } = options;

  // This allows sdk users to set the base font size,
  // which scales the visualization's font sizes.
  const baseFontSize = getSizeInPx(options.fontSize);

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
  };
}

export const DEFAULT_VISUALIZATION_THEME = getVisualizationTheme(
  DEFAULT_METABASE_COMPONENT_THEME,
);
