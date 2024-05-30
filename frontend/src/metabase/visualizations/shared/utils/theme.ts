import type { MantineTheme } from "metabase/ui";
import { convertFontSizeToPx } from "metabase/visualizations/shared/utils/font-size-to-px";
import type { VisualizationTheme } from "metabase/visualizations/types";

/** Failsafe in case the font size has an invalid unit */
const FALLBACK_LABEL_FONT_SIZE = 12;

/**
 * Computes the visualization style from the Mantine theme.
 */
export function getVisualizationStyleFromTheme(
  theme: MantineTheme,
): VisualizationTheme {
  const cartesianTheme = theme.other.cartesian;

  // This is used for the embedding sdk theming,
  // where we allow sdk users to customize the base font size.
  // this is not used in the Metabase app.
  const rootFontSize = convertFontSizeToPx(theme.other.fontSize);

  const cartesianLabelSize =
    convertFontSizeToPx(cartesianTheme.label.fontSize, rootFontSize) ??
    FALLBACK_LABEL_FONT_SIZE;

  return {
    cartesian: {
      label: { fontSize: cartesianLabelSize },
    },
  };
}
