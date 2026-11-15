import Color from "color";

import { getColors, staticVizOverrides } from "metabase/ui/colors/colors";
import { color } from "metabase/ui/colors/palette";
import type { ColorGetter } from "metabase/ui/colors/types";
import type { ColorSettings } from "metabase-types/api/settings";

export const createColorGetter = (
  instanceColors: ColorSettings = {},
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
