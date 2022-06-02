import Color from "color";
import { times } from "lodash";
import { color } from "metabase/lib/colors";

export const getChartColors = (values: Record<string, string>) => {
  return times(8, i => values[`accent${i}`]);
};

export const getChartColorValues = (colors: (string | undefined)[]) => {
  return colors.reduce<Record<string, string>>((values, color, i) => {
    color && (values[`accent${i}`] = color);
    return values;
  }, {});
};

export const getChartColorGroups = (): string[][] => {
  return times(8, i => [`accent${i}`, `accent${i}-light`, `accent${i}-dark`]);
};

export const getAutoChartColors = (
  values: Record<string, string>,
  palette: Record<string, string>,
) => {
  const oldColors = getChartColors(values).map(c => (c ? Color(c) : undefined));
  const primaryColor = Color(color("brand", palette));
  const newColors = getAutoColors(oldColors, primaryColor);
  return getChartColorValues(newColors.map(c => c?.hex()));
};

const getAutoColor = (color: Color, index: number) => {
  const newHue = (color.hue() + index * 45) % 360;
  const newSaturation = newHue <= 65 || newHue >= 345 ? 55 : 40;

  return color
    .hue(newHue)
    .saturationv(newSaturation)
    .value(90);
};

const getAutoColors = (colors: (Color | undefined)[], primaryColor: Color) => {
  const baseColor = colors.find(oldColor => oldColor != null) ?? primaryColor;

  const newColors = colors
    .map((_, index) => getAutoColor(baseColor, index))
    .filter(newColor => !isCloseColors(newColor, colors));

  return colors.map(color => (color ? color : newColors.shift()));
};

const isCloseColor = (newColor: Color, oldColor: Color) => {
  return Math.abs(newColor.hue() - oldColor.hue()) <= 20;
};

const isCloseColors = (newColor: Color, colors: (Color | undefined)[]) => {
  return colors.some(oldColor => oldColor && isCloseColor(newColor, oldColor));
};
