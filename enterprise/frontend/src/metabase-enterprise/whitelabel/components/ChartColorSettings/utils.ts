import Color from "color";
import _ from "underscore";

export const getChartColorGroups = (): string[][] => {
  return _.times(8, i => [`accent${i}`, `accent${i}-light`, `accent${i}-dark`]);
};

export const getDefaultChartColors = (
  values: Record<string, string>,
  groups: string[][],
) => {
  return _.omit(values, _.flatten(groups));
};

export const hasCustomChartColors = (
  values: Record<string, string>,
  groups: string[][],
) => {
  return _.flatten(groups).some(name => values[name] != null);
};

export const getAutoChartColors = (
  values: Record<string, string>,
  groups: string[][],
  palette: Record<string, string>,
) => {
  const oldColors = groups
    .map(([name]) => values[name])
    .map(value => (value ? Color(value) : undefined));

  const fallbackColor = Color(palette["brand"]);
  const newColors = getAutoColors(oldColors, fallbackColor);

  const newValues = groups
    .map(([name], index) => [name, newColors[index]?.hex()])
    .filter(([_, value]) => value != null);

  return { ...values, ...Object.fromEntries(newValues) };
};

const getAutoColors = (
  oldColors: (Color | undefined)[],
  fallbackColor: Color,
) => {
  const oldColor = oldColors.find(color => color != null);

  const autoColors: Color[] = [];
  oldColors.forEach((_, index) => {
    if (index === 0 && !oldColor) {
      autoColors.push(fallbackColor);
    } else if (index === 0 && oldColor) {
      autoColors.push(getNextColor(oldColor));
    } else {
      autoColors.push(getNextColor(autoColors[index - 1]));
    }
  });

  const availableColors = autoColors.filter(
    newColor => !isSimilarToColors(newColor, oldColors),
  );

  return oldColors.map(color => (color ? color : availableColors.shift()));
};

const getNextColor = (color: Color) => {
  const newHueChange = color.hue() >= 90 && color.hue() <= 130 ? 60 : 45;
  const newHue = (color.hue() + newHueChange) % 360;
  const newSaturation = newHue <= 65 || newHue >= 345 ? 55 : 40;

  return color.hue(newHue).saturationv(newSaturation).value(90);
};

const isSimilarColor = (newColor: Color, oldColor: Color) => {
  return Math.abs(newColor.hue() - oldColor.hue()) <= 20;
};

const isSimilarToColors = (newColor: Color, colors: (Color | undefined)[]) => {
  return colors.some(
    oldColor => oldColor && isSimilarColor(newColor, oldColor),
  );
};
