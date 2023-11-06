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

export const isPeriodVisible = (height: number) =>
  height > PERIOD_HIDE_HEIGHT_THRESHOLD;

export const formatChangeAutoPrecision = (
  change: number,
  {
    fontFamily,
    fontWeight,
    width,
  }: { fontFamily: string; fontWeight: number; width: number },
): string =>
  [2, 1]
    .map(n => formatChange(change, { maximumFractionDigits: n }))
    .find(
      formatted =>
        measureText(formatted, {
          size: "1rem",
          family: fontFamily,
          weight: fontWeight,
        }).width <= width,
    ) ?? formatChange(change, { maximumFractionDigits: 0 });

export const formatChange = (
  change: number,
  { maximumFractionDigits = 2 } = {},
): string => {
  const n = Math.abs(change);
  return n === Infinity
    ? "∞%"
    : formatNumber(n, { number_style: "percent", maximumFractionDigits });
};

export const getValueWidth = (width: number): number => {
  return getWidthWithoutSpacing(width);
};

const getWidthWithoutSpacing = (width: number) => {
  return Math.max(width - 2 * SPACING, 0);
};

export const getValueHeight = (height: number): number => {
  const valueHeight =
    height -
    (isPeriodVisible(height) ? SCALAR_TITLE_LINE_HEIGHT : 0) -
    PREVIOUS_VALUE_SIZE -
    4 * SPACING;

  return Math.max(valueHeight, 0);
};

export const getChangeWidth = (width: number): number => {
  return Math.max(width - ICON_SIZE - ICON_MARGIN_RIGHT - 2 * SPACING, 0);
};
