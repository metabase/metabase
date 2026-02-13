import dayjs from "dayjs";
import { t } from "ttag";
import _ from "underscore";

import { formatValue } from "metabase/lib/formatting";
import { formatDateTimeRangeWithUnit } from "metabase/lib/formatting/date";
import type { OptionsType } from "metabase/lib/formatting/types";
import { isEmpty } from "metabase/lib/validate";
import { computeChange } from "metabase/visualizations/lib/numeric";
import type {
  ColorGetter,
  ColumnSettings,
} from "metabase/visualizations/types";
import { COMPARISON_TYPES } from "metabase/visualizations/visualizations/SmartScalar/constants";
import {
  formatChange,
  formatPreviousPeriodOptionName,
} from "metabase/visualizations/visualizations/SmartScalar/utils";
import type { ClickObject } from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import { isDate } from "metabase-lib/v1/types/utils/isa";
import type {
  DatasetColumn,
  DateTimeAbsoluteUnit,
  LegacyDatasetQuery,
  RowValue,
  RowValues,
  Series,
  SmartScalarComparison,
  SmartScalarComparisonAnotherColumn,
  SmartScalarComparisonPeriodsAgo,
  SmartScalarComparisonPreviousPeriod,
  SmartScalarComparisonStaticNumber,
  VisualizationSettings,
} from "metabase-types/api";
import type { Insight } from "metabase-types/api/insight";
import { isAbsoluteDateTimeUnit } from "metabase-types/guards/date-time";

export type ComparisonResult = {
  changeArrowIconName: ChangeArrowType | undefined;
  changeColor: string | undefined;
  changeType: ChangeType;
  comparisonDescStr: string | undefined;
  comparisonValue: RowValue | undefined;
  display: {
    percentChange: string;
    comparisonValue: string | number | JSX.Element | null;
  };
  percentChange: number | undefined;
};

interface DateUnitSettings {
  dateColumn: DatasetColumn;
  dateColumnSettings: ColumnSettings;
  dateUnit?: DateTimeAbsoluteUnit;
  queryType: LegacyDatasetQuery["type"];
}

interface MetricData {
  clicked: ClickObject;
  date: string;
  dateUnitSettings: DateUnitSettings;
  formatOptions: ColumnSettings;
  indexData: {
    dimensionColIndex: number;
    metricColIndex: number;
    latestRowIndex: number;
  };
  value: RowValue;
}

export function computeTrend(
  series: Series,
  insights: Insight[] | null | undefined,
  settings: VisualizationSettings,
  { getColor }: { getColor: ColorGetter },
) {
  try {
    const comparisons = settings["scalar.comparisons"] || [];
    const currentMetricData = getCurrentMetricData({
      series,
      insights,
      settings,
    });

    const { clicked, date, dateUnitSettings, formatOptions, value } =
      currentMetricData;

    const displayValue = formatValue(value, formatOptions);
    const displayDate = formatDateStr({ date, dateUnitSettings });

    return {
      trend: {
        value,
        clicked,
        formatOptions,
        display: {
          value: displayValue,
          date: displayDate,
        },
        comparisons: comparisons.map((comparison) =>
          buildComparisonObject({
            comparison,
            currentMetricData,
            series,
            settings,
            getColor,
          }),
        ),
      },
    };
  } catch (error) {
    return {
      error: error as Error,
    };
  }
}

function buildComparisonObject({
  comparison,
  currentMetricData,
  series,
  settings,
  getColor,
}: {
  comparison: SmartScalarComparison;
  currentMetricData: MetricData;
  series: Series;
  settings: VisualizationSettings;
  getColor: ColorGetter;
}): ComparisonResult {
  const { formatOptions, value } = currentMetricData;

  const { comparisonDescStr, comparisonValue } =
    computeComparison({
      comparison,
      currentMetricData,
      series,
    }) || {};

  const percentChange = !isEmpty(comparisonValue)
    ? computeChange(comparisonValue as number, value as number)
    : undefined;

  const {
    changeType,
    changeArrowIconName,
    percentChangeStr,
    comparisonValueStr,
  } = computeChangeTypeWithOptions({
    comparisonValue,
    formatOptions,
    percentChange,
  });

  const changeColor = changeArrowIconName
    ? getArrowColor(
        changeArrowIconName,
        settings["scalar.switch_positive_negative"],
        { getColor },
      )
    : undefined;

  return {
    changeArrowIconName,
    changeColor,
    changeType,
    comparisonDescStr,
    comparisonValue,
    display: {
      percentChange: percentChangeStr,
      comparisonValue: comparisonValueStr,
    },
    percentChange,
  };
}

function computeComparison({
  comparison,
  currentMetricData,
  series,
}: {
  comparison: SmartScalarComparison;
  currentMetricData: MetricData;
  series: Series;
}) {
  const { type } = comparison;

  if (type === COMPARISON_TYPES.ANOTHER_COLUMN) {
    return computeTrendAnotherColumn({
      comparison,
      currentMetricData,
      series,
    });
  }

  if (type === COMPARISON_TYPES.PREVIOUS_VALUE) {
    return computeTrendPreviousValue({
      currentMetricData,
      series,
    });
  }

  if (
    type === COMPARISON_TYPES.PREVIOUS_PERIOD ||
    type === COMPARISON_TYPES.PERIODS_AGO
  ) {
    return computeTrendPeriodsAgo({
      comparison,
      currentMetricData,
      series,
    });
  }

  if (type === COMPARISON_TYPES.STATIC_NUMBER) {
    return computeTrendStaticValue({ comparison });
  }

  throw Error("Invalid comparison type specified.");
}

function getCurrentMetricData({
  series,
  insights,
  settings,
}: {
  series: Series;
  insights: Insight[] | null | undefined;
  settings: VisualizationSettings;
}): MetricData {
  const [
    {
      card,
      data: { rows, cols },
    },
  ] = series;

  // column locations for date and metric
  const dimensionColIndex = cols.findIndex((col) => {
    return isDate(col) || isAbsoluteDateTimeUnit(col.unit);
  });
  const metricColIndex = cols.findIndex(
    (col) => col.name === settings["scalar.field"],
  );

  if (dimensionColIndex === -1) {
    throw Error("No date column was found.");
  }

  if (metricColIndex === -1) {
    throw Error(
      "There was a problem with the primary number you chose. Check the viz settings and select a valid column for the primary number field.",
    );
  }

  // get latest value and date
  const latestRowIndex = _.findLastIndex(rows, (row) => {
    const date = row[dimensionColIndex];
    const value = row[metricColIndex];

    return !isEmpty(value) && !isEmpty(date);
  });
  if (latestRowIndex === -1) {
    throw Error("No rows contain a valid value.");
  }
  const date = rows[latestRowIndex][dimensionColIndex] as string;
  const value = rows[latestRowIndex][metricColIndex];

  // get metric column metadata
  const metricColumn = cols[metricColIndex];
  const metricInsight = insights?.find(
    (insight) => insight.col === metricColumn.name,
  );
  const dateUnit = metricInsight?.unit;
  const dateColumn = cols[dimensionColIndex];
  const dateColumnWithUnit = { ...dateColumn };
  dateColumnWithUnit.unit ??= dateUnit;
  const dateColumnSettings = settings?.column?.(dateColumnWithUnit) ?? {};

  const question = new Question(card);
  const dateUnitSettings: DateUnitSettings = {
    dateColumn: dateColumnWithUnit,
    dateColumnSettings,
    dateUnit,
    queryType: question.isNative() ? "native" : "query",
  };

  const formatOptions = {
    ...settings.column?.(metricColumn),
    compact: settings["scalar.compact_primary_number"],
  };

  const clicked: ClickObject = {
    value,
    column: cols[metricColIndex],
    dimensions: [
      {
        value: rows[latestRowIndex][dimensionColIndex],
        column: cols[dimensionColIndex],
      },
    ],
    data: rows[latestRowIndex].map((value, index) => ({
      value,
      col: cols[index],
    })),
    settings,
  };

  return {
    clicked,
    date,
    dateUnitSettings,
    formatOptions,
    indexData: {
      dimensionColIndex,
      metricColIndex,
      latestRowIndex,
    },
    value,
  };
}

function computeTrendAnotherColumn({
  comparison,
  currentMetricData,
  series,
}: {
  comparison: SmartScalarComparisonAnotherColumn;
  currentMetricData: MetricData;
  series: Series;
}) {
  const { latestRowIndex } = currentMetricData.indexData;
  const { cols, rows } = series[0].data;

  const columnIndex = cols.findIndex(
    (column) => column.name === comparison.column,
  );

  if (columnIndex === -1) {
    return {
      comparisonValueStr: t`(No data)`,
      comparisonDescStr: t`vs. N/A`,
    };
  }

  const column = cols[columnIndex];

  const lastRow = rows[latestRowIndex];
  const comparisonValue = lastRow[columnIndex];

  const displayName = comparison.label || column.display_name;

  return {
    comparisonDescStr: t`vs. ${displayName}`,
    comparisonValue,
  };
}

function computeTrendStaticValue({
  comparison,
}: {
  comparison: SmartScalarComparisonStaticNumber;
}) {
  const { value, label } = comparison;
  return {
    comparisonDescStr: t`vs. ${label}`,
    comparisonValue: value,
  };
}

function computeTrendPreviousValue({
  currentMetricData,
  series,
}: {
  currentMetricData: MetricData;
  series: Series;
}) {
  const [
    {
      data: { rows },
    },
  ] = series;

  const {
    date,
    dateUnitSettings,
    indexData: { dimensionColIndex, metricColIndex, latestRowIndex },
  } = currentMetricData;

  return computeComparisonPreviousValue({
    rows,
    dimensionColIndex,
    metricColIndex,
    nextValueRowIndex: latestRowIndex,
    nextDate: date,
    dateUnitSettings,
  });
}

function computeComparisonPreviousValue({
  rows,
  dimensionColIndex,
  metricColIndex,
  nextValueRowIndex,
  nextDate,
  dateUnitSettings,
}: {
  rows: RowValues[];
  dimensionColIndex: number;
  metricColIndex: number;
  nextValueRowIndex: number;
  nextDate: string | undefined;
  dateUnitSettings: DateUnitSettings;
}) {
  const previousRowIndex = _.findLastIndex(rows, (row, i) => {
    if (i >= nextValueRowIndex) {
      return false;
    }

    const date = row[dimensionColIndex];
    const value = row[metricColIndex];

    return !isEmpty(value) && !isEmpty(date);
  });

  // if no row exists with non-null date and non-null value
  if (previousRowIndex === -1) {
    return null;
  }

  const prevDate = rows[previousRowIndex][dimensionColIndex] as string;
  const prevValue = rows[previousRowIndex][metricColIndex];

  const comparisonDescStr = computeComparisonStrPreviousValue({
    nextDate,
    prevDate,
    dateUnitSettings,
  });

  return {
    comparisonDescStr,
    comparisonValue: prevValue,
  };
}

function computeTrendPeriodsAgo({
  comparison,
  currentMetricData,
  series,
}: {
  comparison: (
    | SmartScalarComparisonPreviousPeriod
    | SmartScalarComparisonPeriodsAgo
  ) & { value?: number };
  currentMetricData: MetricData;
  series: Series;
}) {
  const [
    {
      data: { rows },
    },
  ] = series;

  const {
    date,
    dateUnitSettings,
    indexData: { dimensionColIndex, metricColIndex, latestRowIndex },
  } = currentMetricData;

  if (isEmpty(dateUnitSettings.dateUnit)) {
    throw Error("No date unit supplied for periods ago comparison.");
  }

  const { type, value } = comparison;
  if (type === COMPARISON_TYPES.PERIODS_AGO && !Number.isInteger(value)) {
    throw Error("No integer value supplied for periods ago comparison.");
  }
  const dateUnitsAgo = value ?? 1;

  return computeComparisonPeriodsAgo({
    rows,
    dimensionColIndex,
    metricColIndex,
    nextValueRowIndex: latestRowIndex,
    nextDate: date,
    dateUnitSettings,
    dateUnitsAgo,
  });
}

function computeComparisonPeriodsAgo({
  rows,
  dimensionColIndex,
  metricColIndex,
  nextValueRowIndex,
  nextDate,
  dateUnitSettings,
  dateUnitsAgo,
}: {
  rows: RowValues[];
  dimensionColIndex: number;
  metricColIndex: number;
  nextValueRowIndex: number;
  nextDate: string | undefined;
  dateUnitSettings: DateUnitSettings;
  dateUnitsAgo: number;
}) {
  const computedPrevDate = dayjs
    .parseZone(nextDate)
    .subtract(dateUnitsAgo, dateUnitSettings.dateUnit)
    .format();

  const rowPeriodsAgo = getRowOfPeriodsAgo({
    prevDate: computedPrevDate,
    dateUnit: dateUnitSettings.dateUnit,
    dateUnitsAgo,
    dimensionColIndex,
    metricColIndex,
    nextValueRowIndex,
    rows,
  });

  const getPreviousPeriodStr = () => {
    const { dateUnit } = dateUnitSettings;
    const previousPeriodStr =
      dateUnit && formatPreviousPeriodOptionName(dateUnit);
    return (previousPeriodStr || t`Previous`).toLocaleLowerCase();
  };

  const prevDate = !isEmpty(rowPeriodsAgo)
    ? (rowPeriodsAgo?.[dimensionColIndex] as string)
    : computedPrevDate;
  const comparisonDescStr =
    dateUnitsAgo === 1
      ? t`vs. ${getPreviousPeriodStr()}`
      : computeComparisonStrPreviousValue({
          dateUnitSettings,
          nextDate,
          prevDate,
        });

  // if no row exists with date "X periods ago"
  if (isEmpty(rowPeriodsAgo)) {
    return {
      comparisonDescStr,
    };
  }

  const prevValue = rowPeriodsAgo?.[metricColIndex];

  return {
    comparisonDescStr,
    comparisonValue: prevValue,
  };
}

function getRowOfPeriodsAgo({
  prevDate,
  dateUnit,
  dateUnitsAgo,
  dimensionColIndex,
  metricColIndex,
  nextValueRowIndex,
  rows,
}: {
  prevDate: string | undefined;
  dateUnit: DateTimeAbsoluteUnit | undefined;
  dateUnitsAgo: number;
  dimensionColIndex: number;
  metricColIndex: number;
  nextValueRowIndex: number;
  rows: RowValues[];
}) {
  const targetDate = dayjs.parseZone(prevDate);
  // skip the latest element since that is our current value
  const searchIndexStart = nextValueRowIndex - 1;
  if (searchIndexStart < 0) {
    return undefined;
  }

  // only look dateUnitsAgo elements (dates) into the past,
  // since looking any further would automatically result in a date before
  // X periods ago and any prior dates would be further beyond our desired
  // comparison date
  const lastCandidateIndex = searchIndexStart - (dateUnitsAgo - 1);
  const searchIndexEnd = lastCandidateIndex >= 0 ? lastCandidateIndex : 0;

  for (let i = searchIndexStart; i >= searchIndexEnd; i--) {
    const candidateRow = rows[i];
    const candidateDate = dayjs.parseZone(
      candidateRow?.[dimensionColIndex] as string | undefined,
    );
    const candidateValue = candidateRow[metricColIndex];

    if (
      dateUnit &&
      areDatesTheSame({ candidateDate, dateUnit, targetDate }) &&
      !isEmpty(candidateValue)
    ) {
      return candidateRow;
    }

    // if current candidate is before the targetDate, we can stop searching
    // because previous rows will only be further in the past
    if (targetDate.diff(candidateDate, dateUnit) > 0) {
      return undefined;
    }
  }

  return undefined;
}

function areDatesTheSame({
  candidateDate,
  targetDate,
  dateUnit,
}: {
  candidateDate: dayjs.Dayjs;
  targetDate: dayjs.Dayjs;
  dateUnit: DateTimeAbsoluteUnit;
}) {
  if (targetDate.diff(candidateDate, dateUnit) !== 0) {
    return false;
  }

  // if dates have different time-zones, the above check can be bypassed
  // i.e. if the candidateDate has a more negative offset than the targetDate
  // the comparison can result in a diff of 0 because the candidateDate
  // is not one full dateUnit behind, only partially (0 < x < 1) behind
  // examples: targetDate: 12-01-2023T00:00-04:00 (-4 offset)
  //           candidateDate: 11-01-2023T00:00-05:00 (-5 offset)
  //                       =: 11-01-2023T01:00-04:00
  //           targetDate.diff(candidateDate, "month") === 0 (true)
  // so in order to account for this, we should check to make sure the
  // dateUnit number is the same as well
  if (targetDate?.[dateUnit]() !== candidateDate?.[dateUnit]()) {
    return false;
  }

  return true;
}

function computeComparisonStrPreviousValue({
  dateUnitSettings,
  prevDate,
  nextDate,
}: {
  dateUnitSettings: DateUnitSettings;
  prevDate: string;
  nextDate: string | undefined;
}) {
  const isSameDay = dayjs.parseZone(prevDate).isSame(nextDate, "day");
  const isSameYear = dayjs.parseZone(prevDate).isSame(nextDate, "year");

  const options = {
    removeDay: isSameDay,
    removeYear: isSameYear,
  };

  const formattedDateStr = formatDateStr({
    date: prevDate,
    dateUnitSettings,
    options,
  });

  return t`vs. ${formattedDateStr}`;
}

function formatDateStr({
  date,
  dateUnitSettings,
  options,
}: {
  date: string;
  dateUnitSettings: DateUnitSettings;
  options?: OptionsType;
}) {
  const { dateColumn, dateColumnSettings, dateUnit, queryType } =
    dateUnitSettings;

  if (!dateUnit || queryType === "native") {
    return formatValue(date, {
      ...dateColumnSettings,
      column: dateColumn,
    });
  }

  return formatDateTimeRangeWithUnit([date], dateUnit, {
    ...options,
    compact: true,
  });
}

export const CHANGE_TYPE_OPTIONS = {
  get MISSING() {
    return {
      CHANGE_TYPE: "PREVIOUS_VALUE_MISSING" as const,
      PERCENT_CHANGE_STR: t`N/A`,
      COMPARISON_VALUE_STR: t`(No data)`,
    };
  },
  get SAME() {
    return {
      CHANGE_TYPE: "PREVIOUS_VALUE_SAME" as const,
      PERCENT_CHANGE_STR: t`No change`,
      COMPARISON_VALUE_STR: "",
    };
  },
  get CHANGED() {
    return {
      CHANGE_TYPE: "PREVIOUS_VALUE_CHANGED" as const,
    };
  },
};

type ChangeType =
  (typeof CHANGE_TYPE_OPTIONS)[keyof typeof CHANGE_TYPE_OPTIONS]["CHANGE_TYPE"];

export const CHANGE_ARROW_ICONS = {
  ARROW_UP: "arrow_up",
  ARROW_DOWN: "arrow_down",
} as const;

type ChangeArrowType =
  (typeof CHANGE_ARROW_ICONS)[keyof typeof CHANGE_ARROW_ICONS];

function computeChangeTypeWithOptions({
  comparisonValue,
  formatOptions,
  percentChange,
}: {
  comparisonValue: RowValue | undefined;
  formatOptions: ColumnSettings;
  percentChange: number | undefined;
}) {
  if (isEmpty(comparisonValue)) {
    return {
      changeType: CHANGE_TYPE_OPTIONS.MISSING.CHANGE_TYPE,
      percentChangeStr: CHANGE_TYPE_OPTIONS.MISSING.PERCENT_CHANGE_STR,
      comparisonValueStr: CHANGE_TYPE_OPTIONS.MISSING.COMPARISON_VALUE_STR,
    };
  }

  if (percentChange === 0) {
    return {
      changeType: CHANGE_TYPE_OPTIONS.SAME.CHANGE_TYPE,
      percentChangeStr: CHANGE_TYPE_OPTIONS.SAME.PERCENT_CHANGE_STR,
      comparisonValueStr: CHANGE_TYPE_OPTIONS.SAME.COMPARISON_VALUE_STR,
    };
  }

  return {
    changeType: CHANGE_TYPE_OPTIONS.CHANGED.CHANGE_TYPE,
    changeArrowIconName:
      percentChange != null && percentChange < 0
        ? CHANGE_ARROW_ICONS.ARROW_DOWN
        : CHANGE_ARROW_ICONS.ARROW_UP,
    percentChangeStr: percentChange ? formatChange(percentChange) : "",
    comparisonValueStr: formatValue(comparisonValue, formatOptions),
  };
}

function getArrowColor(
  changeArrowIconName: ChangeArrowType,
  shouldSwitchPositiveNegative: boolean | undefined,
  { getColor }: { getColor: ColorGetter },
) {
  const arrowIconColorNames = shouldSwitchPositiveNegative
    ? {
        [CHANGE_ARROW_ICONS.ARROW_DOWN]: getColor("success"),
        [CHANGE_ARROW_ICONS.ARROW_UP]: getColor("error"),
      }
    : {
        [CHANGE_ARROW_ICONS.ARROW_DOWN]: getColor("error"),
        [CHANGE_ARROW_ICONS.ARROW_UP]: getColor("success"),
      };

  return arrowIconColorNames[changeArrowIconName];
}
