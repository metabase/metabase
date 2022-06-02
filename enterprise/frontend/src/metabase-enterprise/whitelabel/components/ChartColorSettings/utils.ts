import Color from "color";
import { fromPairs, times } from "lodash";
import { color } from "metabase/lib/colors";

export const getChartColorGroups = (): string[][] => {
  return times(8, i => [`accent${i}`, `accent${i}-light`, `accent${i}-dark`]);
};

export const getAutoChartColors = (
  groups: string[][],
  colors: Record<string, string>,
  palette: Record<string, string>,
) => {
  const oldHexes = groups.map(([name]) => colors[name]);
  const oldColors = oldHexes.map(color => (color ? Color(color) : undefined));
  const primaryColor = Color(color("brand", palette));
  const newColors = getAutoColors(oldColors, primaryColor);
  const newHexes = newColors.map(color => color?.hex());

  return fromPairs(groups.map(([name], index) => [name, newHexes[index]]));
};

const getAutoColor = (color: Color, index: number) => {
  const newHue = (color.hue() + index * 45) % 360;
  const newSaturation = newHue <= 65 || newHue >= 345 ? 55 : 40;

  return color
    .hue(newHue)
    .saturationv(newSaturation)
    .value(90);
};

const isCloseColor = (newColor: Color, oldColor: Color) => {
  return Math.abs(newColor.hue() - oldColor.hue()) <= 20;
};

const isCloseColors = (newColor: Color, colors: (Color | undefined)[]) => {
  return colors.some(oldColor => oldColor && isCloseColor(newColor, oldColor));
};

const getAutoColors = (colors: (Color | undefined)[], primaryColor: Color) => {
  const baseColor = colors.find(oldColor => oldColor != null) ?? primaryColor;

  const newColors = colors
    .map((_, index) => getAutoColor(baseColor, index))
    .filter(newColor => isCloseColors(newColor, colors));

  return colors.map(color => (color ? color : newColors.shift()));
};
