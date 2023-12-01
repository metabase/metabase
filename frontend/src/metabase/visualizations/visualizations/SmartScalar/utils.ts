import dayjs from "dayjs";
import { t } from "ttag";
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

export const COMPARISON_TYPES = {
  COMPARE_TO_PREVIOUS: "previousValue",
  PREVIOUS_PERIOD: "previousPeriod",
  PERIODS_AGO: "periodsAgo",
} as const;

const PLACEHOLDER_STR = "[placeholder]";
export const COMPARISON_OPTIONS = {
  PREVIOUS_PERIOD: {
    type: COMPARISON_TYPES.PREVIOUS_PERIOD,
    nameTemplate: t`Previous ${PLACEHOLDER_STR}`,
  },
  PERIODS_AGO: {
    type: COMPARISON_TYPES.PERIODS_AGO,
    nameTemplate: t`${PLACEHOLDER_STR} ago`,
    MenuItemComponent: PeriodsAgoInputWidget,
  },
  COMPARE_TO_PREVIOUS: {
    type: COMPARISON_TYPES.COMPARE_TO_PREVIOUS,
    name: t`Compare to previous`,
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

  const options: ComparisonOption[] = [
    COMPARISON_OPTIONS.COMPARE_TO_PREVIOUS,
    {
      ...COMPARISON_OPTIONS.PREVIOUS_PERIOD,
      name: COMPARISON_OPTIONS.PREVIOUS_PERIOD.nameTemplate.replace(
        PLACEHOLDER_STR,
        t`${dateUnit}`,
      ),
    },
  ];

  const maxPeriodsAgo = getMaxPeriodsAgo({ cols, rows, dateUnit });

  // only add this option is # number of selectable periods ago is >= 2
  // since we already have an option for 1 period ago -> PREVIOUS_PERIOD
  if (maxPeriodsAgo >= 2) {
    options.push({
      ...COMPARISON_OPTIONS.PERIODS_AGO,
      name: COMPARISON_OPTIONS.PERIODS_AGO.nameTemplate.replace(
        PLACEHOLDER_STR,
        t`${dateUnit}s`,
      ),
      maxValue: maxPeriodsAgo,
    });
  }

  return options;
}

export function isComparisonValid(series, settings) {
  const [
    {
      data: { cols, insights, rows },
    },
  ] = series;

  const comparison: SelectedComparisonOption = settings["scalar.comparisons"];

  const dateUnit = insights?.find(
    insight => insight.col === settings["scalar.field"],
  )?.unit;

  if (isEmpty(dateUnit)) {
    return false;
  }

  // ! check with product + design to see if we want to over-ride this setting
  // ! or not in this case
  if (comparison.type === COMPARISON_TYPES.PERIODS_AGO) {
    const selectedPeriodsAgo = comparison.value;
    const maxPeriodsAgo = getMaxPeriodsAgo({ cols, rows, dateUnit });

    if (selectedPeriodsAgo > maxPeriodsAgo) {
      return false;
    }
  }

  return true;
}

function getMaxPeriodsAgo({ cols, rows, dateUnit }) {
  // column locations for date and metric
  const dimensionIndex = cols.findIndex(col => isDate(col));

  const latestNonEmptyRow = rows.findLast(row => !isEmpty(row[dimensionIndex]));
  const latestNonEmptyDate = latestNonEmptyRow[dimensionIndex];
  const earliestNonEmptyRow = rows.find(row => !isEmpty(row[dimensionIndex]));
  const earliestNonEmptyDate = earliestNonEmptyRow[dimensionIndex];

  return dayjs(latestNonEmptyDate).diff(earliestNonEmptyDate, dateUnit);
}

export type SelectedComparisonOption =
  | {
      type: typeof COMPARISON_TYPES.COMPARE_TO_PREVIOUS;
    }
  | {
      type: typeof COMPARISON_TYPES.PREVIOUS_PERIOD;
    }
  | {
      type: typeof COMPARISON_TYPES.PERIODS_AGO;
      value: number;
    };

export type ComparisonOption = {
  type:
    | typeof COMPARISON_TYPES.COMPARE_TO_PREVIOUS
    | typeof COMPARISON_TYPES.PREVIOUS_PERIOD
    | typeof COMPARISON_TYPES.PERIODS_AGO;
  name: string;
  MenuItemComponent?: React.ComponentType<any>;
  maxValue?: number;
};
