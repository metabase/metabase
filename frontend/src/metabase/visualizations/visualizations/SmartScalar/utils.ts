import dayjs from "dayjs";
import { isEmpty } from "metabase/lib/validate";
import { formatNumber } from "metabase/lib/formatting";
import { measureText } from "metabase/lib/measure-text";
import { isDate } from "metabase-lib/types/utils/isa";
import { PeriodsAgoInputWidget } from "./SmartScalarSettingsWidgets";

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

export const COMPARISON_OPTIONS = {
  PREVIOUS_PERIOD: {
    type: "previousPeriod",
    placeHolderStr: "Previous [dateUnit]",
    placeholder: "[dateUnit]",
  },
  PERIODS_AGO: {
    type: "periodsAgo",
    placeHolderStr: "[X dateUnits] ago",
    placeholder: "[X dateUnits]",
    MenuItemComponent: PeriodsAgoInputWidget,
  },
  COMPARE_TO_PREVIOUS: {
    type: "previousValue",
    name: "Compare to previous",
  },
};

export function getComparisonOptions(series, settings) {
  const [
    {
      data: { cols, insights, rows },
    },
  ] = series;

  const dateUnit = insights?.find(
    insight => insight.col === settings["scalar.field"],
  )?.unit;

  if (isEmpty(dateUnit)) {
    return [COMPARISON_OPTIONS.COMPARE_TO_PREVIOUS];
  }

  // column locations for date and metric
  const dimensionIndex = cols.findIndex(col => isDate(col));

  const latestNonEmptyRow = rows.findLast(row => !isEmpty(row[dimensionIndex]));
  const latestNonEmptyDate = latestNonEmptyRow[dimensionIndex];
  const earliestNonEmptyRow = rows.find(row => !isEmpty(row[dimensionIndex]));
  const earliestNonEmptyDate = earliestNonEmptyRow[dimensionIndex];

  const maxPeriodsAgo = dayjs(latestNonEmptyDate).diff(
    earliestNonEmptyDate,
    dateUnit,
  );

  return [
    COMPARISON_OPTIONS.COMPARE_TO_PREVIOUS,
    {
      ...COMPARISON_OPTIONS.PREVIOUS_PERIOD,
      name: COMPARISON_OPTIONS.PREVIOUS_PERIOD.placeHolderStr.replace(
        COMPARISON_OPTIONS.PREVIOUS_PERIOD.placeholder,
        dateUnit,
      ),
    },
    {
      ...COMPARISON_OPTIONS.PERIODS_AGO,
      name: COMPARISON_OPTIONS.PERIODS_AGO.placeHolderStr.replace(
        COMPARISON_OPTIONS.PERIODS_AGO.placeholder,
        `${dateUnit}s`,
      ),
      maxValue: maxPeriodsAgo,
    },
  ];
}
