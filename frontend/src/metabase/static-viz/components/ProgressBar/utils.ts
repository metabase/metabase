import Color from "color";
import { t } from "ttag";
import { measureText } from "metabase/static-viz/lib/text";
import { ProgressBarData } from "./types";

export const createPalette = (color: string) => ({
  unachieved: color,
  achieved: Color(color).darken(0.25).hex(),
  exceeded: Color(color).darken(0.5).hex(),
});

export const getColors = (
  { value, goal }: ProgressBarData,
  palette: ReturnType<typeof createPalette>,
) => {
  const isExceeded = value > goal;

  const backgroundBar = isExceeded ? palette.exceeded : palette.unachieved;
  const foregroundBar = palette.achieved;
  const pointer = isExceeded ? palette.exceeded : palette.achieved;

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
  const valueTextWidth = measureText(valueText, fontSize);

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
