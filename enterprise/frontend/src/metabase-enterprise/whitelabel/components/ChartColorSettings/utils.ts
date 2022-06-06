import Color from "color";
import { chain, flatten, omit, times } from "lodash";

export const getChartColorGroups = (): string[][] => {
  return times(8, i => [`accent${i}`, `accent${i}-light`, `accent${i}-dark`]);
};

export const getDefaultChartColors = (
  values: Record<string, string>,
  groups: string[][],
) => {
  return omit({ ...values }, flatten(groups));
};

export const hasCustomChartColors = (
  values: Record<string, string>,
  groups: string[][],
) => {
  return flatten(groups).some(name => values[name] != null);
};

export const getAutoChartColors = (
  values: Record<string, string>,
  groups: string[][],
  palette: Record<string, string>,
) => {
  const oldColors = chain(groups)
    .map(([name]) => values[name])
    .map(value => (value ? Color(value) : undefined))
    .value();

  const fallbackColor = Color(palette["brand"]);
  const newColors = getAutoColors(oldColors, fallbackColor);
  const defaultValues = getDefaultChartColors(values, groups);

  const newValues = chain(groups)
    .map(([name], index) => [name, newColors[index]?.hex()])
    .filter(([_, value]) => value != null)
    .fromPairs()
    .value();

  return { ...defaultValues, ...newValues };
};

const getAutoColors = (
  oldColors: (Color | undefined)[],
  fallbackColor: Color,
) => {
  const baseColor = oldColors.find(color => color != null) ?? fallbackColor;

  const autoColors: Color[] = [];
  oldColors.forEach((_, index) =>
    autoColors.push(getNextColor(index ? autoColors[index - 1] : baseColor)),
  );

  const availableColors = autoColors.filter(
    newColor => !isSimilarToColors(newColor, oldColors),
  );

  return oldColors.map(color => (color ? color : availableColors.shift()));
};

const getNextColor = (color: Color) => {
  const newHueChange = color.hue() >= 90 && color.hue() <= 130 ? 60 : 45;
  const newHue = (color.hue() + newHueChange) % 360;
  const newSaturation = newHue <= 65 || newHue >= 345 ? 55 : 40;

  return color
    .hue(newHue)
    .saturationv(newSaturation)
    .value(90);
};

const isSimilarColor = (newColor: Color, oldColor: Color) => {
  return Math.abs(newColor.hue() - oldColor.hue()) <= 20;
};

const isSimilarToColors = (newColor: Color, colors: (Color | undefined)[]) => {
  return colors.some(
    oldColor => oldColor && isSimilarColor(newColor, oldColor),
  );
};
