import { DEFAULT_METABASE_COMPONENT_THEME } from "embedding-sdk/lib/theme";
import type { MantineThemeOther } from "metabase/ui";
import { CHART_STYLE } from "metabase/visualizations/echarts/cartesian/constants/style";
import { convertFontSizeToPx } from "metabase/visualizations/shared/utils/font-size-to-px";
import type { VisualizationTheme } from "metabase/visualizations/types";

const FALLBACK_LABEL_FONT_SIZE = CHART_STYLE.axisTicks.size;

/**
 * Computes the visualization style from the Mantine theme.
 */
export function getVisualizationStyleFromTheme(
  options: MantineThemeOther,
): VisualizationTheme {
  const { cartesian, fontSize } = options;

  // This is used for the embedding sdk theming,
  // where we allow sdk users to customize the base font size.
  // this is not used in the Metabase app.
  const rootFontSize = convertFontSizeToPx(fontSize);

  // Fallback is applied when the user-supplied font size
  // has an invalid unit.
  const cartesianLabelSize =
    convertFontSizeToPx(cartesian.label.fontSize, rootFontSize) ??
    FALLBACK_LABEL_FONT_SIZE;

  return {
    cartesian: {
      label: { fontSize: cartesianLabelSize },
    },
  };
}

export const DEFAULT_VISUALIZATION_THEME = getVisualizationStyleFromTheme(
  DEFAULT_METABASE_COMPONENT_THEME,
);
