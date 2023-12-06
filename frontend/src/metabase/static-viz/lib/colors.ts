import Color from "color";
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

export const getWaterfallColors = (
  colorSettings: Partial<WaterfallColors> = {},
  getColor: ColorGetter,
): WaterfallColors => {
  return {
    waterfallTotal: colorSettings.waterfallTotal ?? getColor("text-dark"),
    waterfallPositive: colorSettings.waterfallPositive ?? getColor("accent1"),
    waterfallNegative: colorSettings.waterfallNegative ?? getColor("accent3"),
  };
};

// We intentionally want to return white text color more frequently
// https://www.notion.so/Maz-notes-on-viz-settings-67aed0e4ddcc4d4a83028992c4301820?d=513f4f7fa9c143cb874c7e4525dfb1e9#277d6b3eeb464eac86088abd144fde9e
const WHITE_TEXT_PRIORITY_FACTOR = 3;

export const getTextColorForBackground = (
  backgroundColor: string,
  getColor: ColorGetter = color,
) => {
  const whiteTextContrast =
    Color(getColor(backgroundColor)).contrast(Color(getColor("white"))) *
    WHITE_TEXT_PRIORITY_FACTOR;
  const darkTextContrast = Color(getColor(backgroundColor)).contrast(
    Color(getColor("text-dark")),
  );

  return whiteTextContrast > darkTextContrast
    ? getColor("white")
    : getColor("text-dark");
};
