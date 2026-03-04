import Color from "color";

import { getColors, staticVizOverrides } from "metabase/lib/colors/colors";
import { color } from "metabase/lib/colors/palette";
import type { ColorPalette } from "metabase/lib/colors/types";
import type { ColorGetter } from "metabase/visualizations/types";

export const createColorGetter = (
  instanceColors: ColorPalette = {},
): ColorGetter => {
  const palette = { ...getColors(instanceColors), ...staticVizOverrides };

  return (colorName: string) => {
    const value = color(colorName, palette);

    // Ensure that hex values are given for static viz
    return Color(value).hex();
  };
};

export type WaterfallColors = {
  waterfallTotal: string;
  waterfallPositive: string;
  waterfallNegative: string;
};
