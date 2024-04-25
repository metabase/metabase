import Color from "color";
import { t } from "ttag";

import { measureTextWidth } from "metabase/static-viz/lib/text";

import type { ProgressBarData } from "./types";

const createPalette = (color: string) => ({
  light: Color(color).lighten(0.25).hex(),
  main: color,
  dark: Color(color).darken(0.3).hex(),
});

export const getColors = ({ value, goal }: ProgressBarData, color: string) => {
  const palette = createPalette(color);
  const isExceeded = value > goal;

  const backgroundBar = isExceeded ? palette.dark : palette.light;
  const foregroundBar = palette.main;
  const pointer = isExceeded ? palette.dark : palette.main;

  return {
    backgroundBar,
    foregroundBar,
    pointer,
  };
};

export const getBarText = ({ value, goal }: ProgressBarData) => {
  if (value === goal) {
    return t`Goal met`;
  } else if (value > goal) {
    return t`Goal exceeded`;
  }

  return null;
};

export const calculatePointerLabelShift = (
  valueText: string,
  pointerX: number,
  xMin: number,
  xMax: number,
  pointerWidth: number,
  fontSize: number,
) => {
  const valueTextWidth = measureTextWidth(valueText, fontSize);

  const distanceToLeftBorder = pointerX - xMin;
  const isCrossingLeftBorder = valueTextWidth / 2 > distanceToLeftBorder;
  if (isCrossingLeftBorder) {
    return valueTextWidth / 2 - distanceToLeftBorder - pointerWidth / 2;
  }

  const distanceToRightBorder = xMax - pointerX;
  const isCrossingRightBorder = valueTextWidth / 2 > distanceToRightBorder;
  if (isCrossingRightBorder) {
    return distanceToRightBorder - valueTextWidth / 2 + pointerWidth / 2;
  }

  return 0;
};
