// eslint-disable-next-line no-restricted-imports -- deprecated usage
import moment from "moment";
import { t } from "ttag";
import * as Lib from "metabase-lib";
import { formatValue } from "metabase/lib/formatting/value";
import { formatDateTimeRangeWithUnit } from "metabase/lib/formatting/date";
import { color, colors } from "metabase/lib/colors";
import {
  COMPARISON_TYPES,
  formatChange,
} from "metabase/visualizations/visualizations/SmartScalar/utils";
import { isEmpty } from "metabase/lib/validate";
import { isDate } from "metabase-lib/types/utils/isa";

export function computeTrend(series, insights, settings) {
  // get current metric data
  const currentMetricData = getCurrentMetricData({
    series,
    insights,
    settings,
  });
  if (isEmpty(currentMetricData)) {
    return null;
  }
  const { clicked, date, dateUnitSettings, formatOptions, value } =
    currentMetricData;

  // get comparison data
  const comparisonData = computeComparison({
    currentMetricData,
    series,
    settings,
  });
  const { comparisonDescStr, comparisonValue } = comparisonData ?? {};

  // find percent change in values
  const percentChange = !isEmpty(comparisonValue)
    ? computeChange(comparisonValue, value)
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

  const changeColor = !isEmpty(changeArrowIconName)
    ? getArrowColor(
        changeArrowIconName,
        settings["scalar.switch_positive_negative"],
      )
    : undefined;

  const valueStr = formatValue(value, formatOptions);
  const dateStr = formatDateStr({ date, dateUnitSettings });
  return {
    value,
    clicked,
    formatOptions,
    display: {
      value: valueStr,
      date: dateStr,
    },
    comparison: {
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
    },
  };
}

function computeComparison({ currentMetricData, series, settings }) {
  const { type } = settings["scalar.comparisons"];

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
      currentMetricData,
      series,
      settings,
    });
  }

  throw Error("Invalid comparison type specified");
}

function getCurrentMetricData({ series, insights, settings }) {
  const [
    {
      data: { rows, cols },
    },
  ] = series;

  // column locations for date and metric
  const dimensionColIndex = cols.findIndex(col => isDate(col));
  const metricColIndex = cols.findIndex(
    col => col.name === settings["scalar.field"],
  );

  if (dimensionColIndex === -1 || metricColIndex === -1) {
    return null;
  }

  // get latest value and date
  const latestRowIndex = rows.length - 1;
  const date = rows[latestRowIndex][dimensionColIndex];
  const value = rows[latestRowIndex][metricColIndex];
  if (isEmpty(value) || isEmpty(date)) {
    return null;
  }

  // get metric column metadata
  const metricColumn = cols[metricColIndex];
  const metricInsight = insights?.find(
    insight => insight.col === metricColumn.name,
  );
  const dateUnit = metricInsight?.unit;
  const dateColumn = cols[dimensionColIndex];
  const dateColumnSettings = settings?.column?.(dateColumn) ?? {};

  const dateUnitSettings = {
    dateColumn,
    dateColumnSettings,
    dateUnit,
  };

  const formatOptions = settings.column?.(metricColumn);

  const clicked = {
    value,
    column: cols[dimensionColIndex],
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

function computeTrendPreviousValue({ currentMetricData, series }) {
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
}) {
  const previousRow = rows.findLast(
    (row, i) =>
      i < nextValueRowIndex &&
      !isEmpty(row[metricColIndex]) &&
      !isEmpty(row[dimensionColIndex]),
  );
  // if no row exists with non-null date and non-null value
  if (isEmpty(previousRow)) {
    return null;
  }

  const prevDate = previousRow[dimensionColIndex];
  const prevValue = previousRow[metricColIndex];

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

function computeTrendPeriodsAgo({ currentMetricData, series, settings }) {
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
    throw Error("No date unit supplied for periods ago comparison");
  }

  const { type, value } = settings["scalar.comparisons"];
  if (type === COMPARISON_TYPES.PERIODS_AGO && !Number.isInteger(value)) {
    throw Error("No integer value supplied for periods ago comparison");
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
}) {
  const dateUnitDisplay = Lib.describeTemporalUnit(
    dateUnitSettings.dateUnit,
  ).toLowerCase();

  const prevDate = moment
    .parseZone(nextDate)
    .subtract(dateUnitsAgo, dateUnitSettings.dateUnit)
    .format();

  const comparisonDescStr =
    dateUnitsAgo === 1
      ? t`vs. previous ${dateUnitDisplay}`
      : computeComparisonStrPreviousValue({
          dateUnitSettings,
          nextDate,
          prevDate,
        });

  const rowPeriodsAgo = getRowOfPeriodsAgo({
    prevDate,
    dateUnitsAgo,
    dimensionColIndex,
    nextValueRowIndex,
    rows,
  });
  // if no row exists with date "X periods ago"
  if (isEmpty(rowPeriodsAgo)) {
    return {
      comparisonDescStr,
    };
  }

  const prevValue = rowPeriodsAgo[metricColIndex];

  return {
    comparisonDescStr,
    comparisonValue: prevValue,
  };
}

function getRowOfPeriodsAgo({
  prevDate,
  dateUnitsAgo,
  dimensionColIndex,
  nextValueRowIndex,
  rows,
}) {
  const targetDate = moment.parseZone(prevDate);
  // skip the latest element since that is our current value
  const searchIndexStart = nextValueRowIndex - 1;
  if (searchIndexStart < 0) {
    return -1;
  }

  // only look dateUnitsAgo elements (dates) into the past,
  // since looking any further would automatically result in a date before
  // X periods ago and any prior dates would be further beyond our desired
  // comparison date
  const lastCandidateIndex = nextValueRowIndex - 1 - (dateUnitsAgo - 1);
  const searchIndexEnd = lastCandidateIndex >= 0 ? lastCandidateIndex : 0;

  for (let i = searchIndexStart; i >= searchIndexEnd; i--) {
    const row = rows[i];
    const rowDate = moment.parseZone(row[dimensionColIndex]);

    if (targetDate.isSame(rowDate)) {
      return row;
    }

    if (targetDate.isAfter(rowDate)) {
      return undefined;
    }
  }

  return undefined;
}

function computeComparisonStrPreviousValue({
  dateUnitSettings,
  prevDate,
  nextDate,
}) {
  const isSameDay = moment.parseZone(prevDate).isSame(nextDate, "day");
  const isSameYear = moment.parseZone(prevDate).isSame(nextDate, "year");

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

function formatDateStr({ date, dateUnitSettings, options }) {
  const { dateColumn, dateColumnSettings, dateUnit } = dateUnitSettings;

  if (isEmpty(dateUnit)) {
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

// compute the percent change between two values (comparisonVal → currVal)
// percentChange = (currVal - comparisonVal) / Math.abs(comparisonVal)
export function computeChange(comparisonVal, currVal) {
  if (comparisonVal === 0) {
    // percentChange = currVal / 0
    return currVal === 0 ? 0 : currVal > 0 ? Infinity : -Infinity;
  }

  return (currVal - comparisonVal) / Math.abs(comparisonVal);
}

export const CHANGE_TYPE_OPTIONS = {
  MISSING: {
    CHANGE_TYPE: "PREVIOUS_VALUE_MISSING",
    PERCENT_CHANGE_STR: t`N/A`,
    COMPARISON_VALUE_STR: t`(No data)`,
  },
  SAME: {
    CHANGE_TYPE: "PREVIOUS_VALUE_SAME",
    PERCENT_CHANGE_STR: t`No change`,
    COMPARISON_VALUE_STR: "",
  },
  CHANGED: {
    CHANGE_TYPE: "PREVIOUS_VALUE_CHANGED",
  },
};

export const CHANGE_ARROW_ICONS = {
  ARROW_UP: "arrow_up",
  ARROW_DOWN: "arrow_down",
};

function computeChangeTypeWithOptions({
  comparisonValue,
  formatOptions,
  percentChange,
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
      percentChange < 0
        ? CHANGE_ARROW_ICONS.ARROW_DOWN
        : CHANGE_ARROW_ICONS.ARROW_UP,
    percentChangeStr: formatChange(percentChange),
    comparisonValueStr: formatValue(comparisonValue, formatOptions),
  };
}

function getArrowColor(changeArrowIconName, shouldSwitchPositiveNegative) {
  const arrowIconColorNames = shouldSwitchPositiveNegative
    ? {
        [CHANGE_ARROW_ICONS.ARROW_DOWN]: colors.success,
        [CHANGE_ARROW_ICONS.ARROW_UP]: colors.error,
      }
    : {
        [CHANGE_ARROW_ICONS.ARROW_DOWN]: colors.error,
        [CHANGE_ARROW_ICONS.ARROW_UP]: colors.success,
      };

  return color(arrowIconColorNames[changeArrowIconName]);
}
