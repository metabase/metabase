import Color from "color";

import { getColors, staticVizOverrides } from "metabase/ui/colors/colors";
import { color } from "metabase/ui/colors/palette";
import type { ColorGetter, ColorPalette } from "metabase/ui/colors/types";

export const createColorGetter = (
  instanceColors: ColorPalette = {},
): ColorGetter => {
  const palette = { ...getColors(instanceColors), ...staticVizOverrides };

  return (colorName: string) => {
    const value = color(colorName, palette);

    // Ensure that hex values are given for static viz
    try {
      return Color(value).hex();
    } catch {
      // Some theme tokens are CSS expressions (e.g. color-mix()) that cannot
      // be statically parsed. Fall back to a parseable color instead of
      // crashing the whole card render in dashboard subscriptions.
      return Color(palette["text-primary"] ?? "#000000").hex();
    }
  };
};

export type WaterfallColors = {
  waterfallTotal: string;
  waterfallPositive: string;
  waterfallNegative: string;
};
