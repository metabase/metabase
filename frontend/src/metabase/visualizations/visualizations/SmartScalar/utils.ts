import { formatNumber } from "metabase/lib/formatting";
import { measureText } from "metabase/lib/measure-text";

import {
  ICON_MARGIN_RIGHT,
  ICON_SIZE,
  MAX_PREVIOUS_VALUE_SIZE,
  MIN_PREVIOUS_VALUE_SIZE,
  SCALAR_TITLE_LINE_HEIGHT,
  SPACING,
  TITLE_2_LINES_HEIGHT_THRESHOLD,
} from "./constants";

export const getTitleLinesCount = (height: number) =>
  height > TITLE_2_LINES_HEIGHT_THRESHOLD ? 2 : 1;

export const formatChangeAutoPrecision = (
  change: number,
  {
    fontFamily,
    fontWeight,
    width,
  }: { fontFamily: string; fontWeight: number; width: number },
): string => {
  for (let fractionDigits = 2; fractionDigits >= 1; --fractionDigits) {
    const formatted = formatChange(change, {
      maximumFractionDigits: fractionDigits,
    });

    const formattedWidth = measureText(formatted, {
      size: "1rem",
      family: fontFamily,
      weight: fontWeight,
    }).width;

    if (formattedWidth <= width) {
      return formatted;
    }
  }

  return formatChange(change, {
    maximumFractionDigits: 0,
  });
};

export const formatChange = (
  change: number,
  { maximumFractionDigits = 2 } = {},
): string =>
  formatNumber(Math.abs(change), {
    number_style: "percent",
    maximumFractionDigits,
  });

export const getValueWidth = (width: number): number => {
  return getWidthWithoutSpacing(width);
};

const getWidthWithoutSpacing = (width: number) => {
  return Math.max(width - 2 * SPACING, 0);
};

export const getValueHeight = (
  height: number,
  canShowPreviousValue: boolean,
): number => {
  const valueHeight =
    height -
    SCALAR_TITLE_LINE_HEIGHT * getTitleLinesCount(height) -
    (canShowPreviousValue ? MAX_PREVIOUS_VALUE_SIZE : MIN_PREVIOUS_VALUE_SIZE) -
    4 * SPACING;

  return Math.max(valueHeight, 0);
};

export const getChangeWidth = (width: number): number => {
  return Math.max(width - ICON_SIZE - ICON_MARGIN_RIGHT - 2 * SPACING, 0);
};

export const getCanShowPreviousValue = ({
  width,
  change,
  previousValue,
  fontFamily,
}: {
  width: number;
  change: string;
  previousValue: string;
  fontFamily: string;
}): boolean => {
  const changeWidth = measureText(change, {
    size: "1rem",
    family: fontFamily,
    weight: 900,
  }).width;

  const previousValueWidth = measureText(previousValue, {
    size: "0.875rem",
    family: fontFamily,
    weight: 700,
  }).width;

  const availablePreviousValueWidth =
    getWidthWithoutSpacing(width) -
    (changeWidth + 2 * SPACING + ICON_SIZE + ICON_MARGIN_RIGHT);

  return availablePreviousValueWidth >= previousValueWidth;
};
