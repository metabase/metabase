import dayjs from "dayjs";
import { t } from "ttag";

import type {
  DatasetColumn,
  RawSeries,
  RowValues,
} from "metabase-types/api/dataset";
import type {
  RelativeDatetimeUnit,
  VisualizationSettings,
} from "metabase-types/api";

import { isEmpty } from "metabase/lib/validate";
import { formatNumber } from "metabase/lib/formatting";
import { measureText } from "metabase/lib/measure-text";
import { isDate } from "metabase-lib/types/utils/isa";

import {
  COMPARISON_TYPES,
  ICON_MARGIN_RIGHT,
  ICON_SIZE,
  PERIOD_HIDE_HEIGHT_THRESHOLD,
  PREVIOUS_VALUE_SIZE,
  SCALAR_TITLE_LINE_HEIGHT,
  SPACING,
} from "./constants";
import type { ComparisonMenuOption } from "./types";

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

export const COMPARISON_SELECTOR_OPTIONS = {
  PREVIOUS_PERIOD: {
    type: COMPARISON_TYPES.PREVIOUS_PERIOD,
  },
  PERIODS_AGO: {
    type: COMPARISON_TYPES.PERIODS_AGO,
  },
  PREVIOUS_VALUE: {
    type: COMPARISON_TYPES.PREVIOUS_VALUE,
    name: t`Previous value`,
  },
} as const;

export function getDefaultComparison(
  series: RawSeries,
  settings: VisualizationSettings,
) {
  const [
    {
      data: { insights },
    },
  ] = series;

  const dateUnit = insights?.find(
    insight => insight.col === settings["scalar.field"],
  )?.unit;

  if (!dateUnit) {
    return createComparisonMenuOption({
      type: COMPARISON_TYPES.PREVIOUS_VALUE,
    });
  }

  return createComparisonMenuOption({
    type: COMPARISON_TYPES.PREVIOUS_PERIOD,
    dateUnit,
  });
}

export function getComparisonOptions(
  series: RawSeries,
  settings: VisualizationSettings,
) {
  const [
    {
      data: { cols, insights, rows },
    },
  ] = series;

  const dateUnit = insights?.find(
    insight => insight.col === settings["scalar.field"],
  )?.unit;

  if (!dateUnit) {
    return [
      createComparisonMenuOption({ type: COMPARISON_TYPES.PREVIOUS_VALUE }),
    ];
  }

  const options: ComparisonMenuOption[] = [
    createComparisonMenuOption({
      type: COMPARISON_TYPES.PREVIOUS_PERIOD,
      dateUnit,
    }),
  ];

  const maxPeriodsAgo = getMaxPeriodsAgo({ cols, rows, dateUnit });

  // only add this option is # number of selectable periods ago is >= 2
  // since we already have an option for 1 period ago -> PREVIOUS_PERIOD
  if (maxPeriodsAgo && maxPeriodsAgo >= 2) {
    options.push(
      createComparisonMenuOption({
        type: COMPARISON_TYPES.PERIODS_AGO,
        dateUnit,
        maxValue: maxPeriodsAgo,
      }),
    );
  }

  options.push(
    createComparisonMenuOption({ type: COMPARISON_TYPES.PREVIOUS_VALUE }),
  );

  return options;
}

export function isComparisonValid(
  series: RawSeries,
  settings: VisualizationSettings,
) {
  const [
    {
      data: { insights },
    },
  ] = series;

  if (
    settings["scalar.comparisons"]?.type === COMPARISON_TYPES.PREVIOUS_VALUE
  ) {
    return true;
  }

  const dateUnit = insights?.find(
    insight => insight.col === settings["scalar.field"],
  )?.unit;

  if (!dateUnit) {
    return false;
  }

  return true;
}

type getMaxPeriodsAgoParameters = {
  cols: DatasetColumn[];
  rows: RowValues[];
  dateUnit: RelativeDatetimeUnit;
};

function getMaxPeriodsAgo({
  cols,
  rows,
  dateUnit,
}: getMaxPeriodsAgoParameters) {
  const dimensionIndex = cols.findIndex(col => isDate(col));

  if (dimensionIndex === -1) {
    return null;
  }

  const latestNonEmptyRow = rows.findLast(row => !isEmpty(row[dimensionIndex]));
  const earliestNonEmptyRow = rows.find(row => !isEmpty(row[dimensionIndex]));

  if (latestNonEmptyRow === undefined || earliestNonEmptyRow === undefined) {
    return null;
  }

  const latestNonEmptyDate = latestNonEmptyRow[dimensionIndex] as string;
  const earliestNonEmptyDate = earliestNonEmptyRow[dimensionIndex] as string;

  if (latestNonEmptyDate === null || earliestNonEmptyDate === null) {
    return null;
  }

  return dayjs(latestNonEmptyDate).diff(earliestNonEmptyDate, dateUnit);
}

type GetComparisonMenuOptionParameters =
  | {
      type: typeof COMPARISON_TYPES.PREVIOUS_VALUE;
    }
  | {
      type: typeof COMPARISON_TYPES.PREVIOUS_PERIOD;
      dateUnit: RelativeDatetimeUnit;
    }
  | {
      type: typeof COMPARISON_TYPES.PERIODS_AGO;
      maxValue: number;
      dateUnit: RelativeDatetimeUnit;
    };

function createComparisonMenuOption(
  comparisonParameters: GetComparisonMenuOptionParameters,
): ComparisonMenuOption {
  const { type } = comparisonParameters;

  if (type === COMPARISON_TYPES.PREVIOUS_PERIOD) {
    const { dateUnit } = comparisonParameters;

    return {
      type,
      name: formatPreviousPeriodOptionName(dateUnit),
    };
  }

  if (type === COMPARISON_TYPES.PERIODS_AGO) {
    const { maxValue, dateUnit } = comparisonParameters;

    return {
      type,
      name: formatPeriodsAgoOptionName(dateUnit),
      maxValue,
    };
  }

  return COMPARISON_SELECTOR_OPTIONS.PREVIOUS_VALUE;
}

function formatPreviousPeriodOptionName(dateUnit: RelativeDatetimeUnit) {
  switch (dateUnit) {
    case "minute":
      return t`Previous minute`;
    case "hour":
      return t`Previous hour`;
    case "day":
      return t`Previous day`;
    case "week":
      return t`Previous week`;
    case "month":
      return t`Previous month`;
    case "quarter":
      return t`Previous quarter`;
    case "year":
      return t`Previous year`;
  }
  return "";
}

function formatPeriodsAgoOptionName(dateUnit: RelativeDatetimeUnit) {
  switch (dateUnit) {
    case "minute":
      return t`minutes ago`;
    case "hour":
      return t`hours ago`;
    case "day":
      return t`days ago`;
    case "week":
      return t`weeks ago`;
    case "month":
      return t`months ago`;
    case "quarter":
      return t`quarters ago`;
    case "year":
      return t`years ago`;
  }
  return "";
}
