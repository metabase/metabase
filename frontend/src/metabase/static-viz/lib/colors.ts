import Color from "color";

import { getColors, staticVizOverrides } from "metabase/ui/colors/colors";
import { color } from "metabase/ui/colors/palette";
import type { ColorPalette } from "metabase/ui/colors/types";
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
