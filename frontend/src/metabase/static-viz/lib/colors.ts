import { colors, color } from "metabase/lib/colors/palette";
import type { ColorPalette } from "metabase/lib/colors/types";
import type { ColorGetter } from "metabase/visualizations/types";

export const createColorGetter = (
  instanceColors: ColorPalette = {},
): ColorGetter => {
  const palette = { ...colors, ...instanceColors };

  return (colorName: string) => color(colorName, palette);
};

export type WaterfallColors = {
  waterfallTotal: string;
  waterfallPositive: string;
  waterfallNegative: string;
};
