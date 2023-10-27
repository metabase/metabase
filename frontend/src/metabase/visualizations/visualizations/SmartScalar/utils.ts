import innerText from "react-innertext";
import { formatNumber } from "metabase/lib/formatting";
import { measureText } from "metabase/lib/measure-text";

import {
  ICON_MARGIN_RIGHT,
  ICON_SIZE,
  PERIOD_HIDE_HEIGHT_THRESHOLD,
  PREVIOUS_VALUE_SIZE,
  SCALAR_TITLE_LINE_HEIGHT,
  SPACING,
} from "./constants";

export const getIsPeriodVisible = (height: number) =>
  height > PERIOD_HIDE_HEIGHT_THRESHOLD;

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

export const getValueHeight = (height: number): number => {
  const valueHeight =
    height -
    (getIsPeriodVisible(height) ? SCALAR_TITLE_LINE_HEIGHT : 0) -
    PREVIOUS_VALUE_SIZE -
    4 * SPACING;

  return Math.max(valueHeight, 0);
};

export const getChangeWidth = (width: number): number => {
  return Math.max(width - ICON_SIZE - ICON_MARGIN_RIGHT - 2 * SPACING, 0);
};

export const getFittedPreviousValue = ({
  width,
  change,
  previousValueCandidates,
  fontFamily,
}: {
  width: number;
  change: string;
  previousValueCandidates: (string | string[])[];
  fontFamily: string;
}): {
  isPreviousValueTruncated: boolean;
  fittedPreviousValue?: string | string[];
} => {
  const changeWidth = measureText(change, {
    size: "1rem",
    family: fontFamily,
    weight: 900,
  }).width;

  const availablePreviousValueWidth =
    getWidthWithoutSpacing(width) -
    (changeWidth + 2 * SPACING + ICON_SIZE + ICON_MARGIN_RIGHT);

  const matchIdx = previousValueCandidates.findIndex(previousValue => {
    const previousValueWidth = measureText(innerText(previousValue), {
      size: "0.875rem",
      family: fontFamily,
      weight: 700,
    }).width;
    return availablePreviousValueWidth >= previousValueWidth;
  });

  return {
    isPreviousValueTruncated: matchIdx !== 0,
    fittedPreviousValue: previousValueCandidates[matchIdx],
  };
};
