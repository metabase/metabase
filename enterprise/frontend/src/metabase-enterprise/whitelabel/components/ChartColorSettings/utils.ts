import type { ColorInstance } from "color";
import Color from "color";
import _ from "underscore";

import { WHITELABEL_ACCENT_KEYS } from "metabase/ui/colors/constants/whitelabel-colors";
import type { ColorPalette } from "metabase/ui/colors/types";
import type { ColorSettings, ColorSettingsAccentKey } from "metabase-types/api";

export const getChartColorGroups = (): ColorSettingsAccentKey[][] => {
  return WHITELABEL_ACCENT_KEYS.map((key) => [
    key,
    `${key}-light`,
    `${key}-dark`,
  ]);
};

export const getDefaultChartColors = (
  values: ColorSettings,
  groups: ColorSettingsAccentKey[][],
): ColorSettings => {
  return _.omit(values, _.flatten(groups));
};

export const hasCustomChartColors = (
  values: ColorSettings,
  groups: ColorSettingsAccentKey[][],
) => {
  return _.flatten(groups).some((name) => values[name] != null);
};

export const getAutoChartColors = (
  values: ColorSettings,
  groups: ColorSettingsAccentKey[][],
  palette: ColorPalette,
): ColorSettings => {
  const oldColors = groups
    .map(([name]) => values[name])
    .map((value) => (value ? Color(value) : undefined));

  const fallbackColor = Color(palette["core-brand"]);
  const newColors = getAutoColors(oldColors, fallbackColor);

  const newValues: ColorSettings = { ...values };
  groups.forEach(([name], index) => {
    const value = newColors[index]?.hex();
    if (name !== undefined && value !== undefined) {
      newValues[name] = value;
    }
  });

  return newValues;
};

const getAutoColors = (
  oldColors: (ColorInstance | undefined)[],
  fallbackColor: ColorInstance,
) => {
  const oldColor = oldColors.find((color) => color != null);

  const autoColors: ColorInstance[] = [];
  oldColors.forEach((_color, index) => {
    if (index === 0 && !oldColor) {
      autoColors.push(fallbackColor);
    } else if (index === 0 && oldColor) {
      autoColors.push(getNextColor(oldColor));
    } else {
      autoColors.push(getNextColor(autoColors[index - 1]));
    }
  });

  const availableColors = autoColors.filter(
    (newColor) => !isSimilarToColors(newColor, oldColors),
  );

  return oldColors.map((color) => (color ? color : availableColors.shift()));
};

const getNextColor = (color: ColorInstance) => {
  const newHueChange = color.hue() >= 90 && color.hue() <= 130 ? 60 : 45;
  const newHue = (color.hue() + newHueChange) % 360;
  const newSaturation = newHue <= 65 || newHue >= 345 ? 55 : 40;

  return color.hue(newHue).saturationv(newSaturation).value(90);
};

const isSimilarColor = (newColor: ColorInstance, oldColor: ColorInstance) => {
  return Math.abs(newColor.hue() - oldColor.hue()) <= 20;
};

const isSimilarToColors = (
  newColor: ColorInstance,
  colors: (ColorInstance | undefined)[],
) => {
  return colors.some(
    (oldColor) => oldColor && isSimilarColor(newColor, oldColor),
  );
};
