// eslint-disable-next-line no-restricted-imports -- deprecated usage
import moment from "moment-timezone";
import { t } from "ttag";
import * as Lib from "metabase-lib";
import { formatValue } from "metabase/lib/formatting/value";
import { formatDateTimeRangeWithUnit } from "metabase/lib/formatting/date";
import { color } from "metabase/lib/colors";
import { formatChange } from "metabase/visualizations/visualizations/SmartScalar/utils";
import { isEmpty } from "metabase/lib/validate";
import { isDate } from "metabase-lib/types/utils/isa";

const FALLBACK_DATE_UNIT = "day";

export function computeTrend(series, insights, settings) {
  const [
    {
      data: { rows, cols },
    },
  ] = series;

  // column locations for date and metric
  const dimensionIndex = cols.findIndex(col => isDate(col));
  const metricIndex = cols.findIndex(
    col => col.name === settings["scalar.field"],
  );

  // get metric column metadata
  const metricColumn = cols[metricIndex];
  const metricInsight = insights?.find(
    insight => insight.col === metricColumn.name,
  );
  const dateUnit = metricInsight?.unit ?? FALLBACK_DATE_UNIT;

  // get latest value and date
  const i = rows.length - 1;
  const date = rows[i]?.[dimensionIndex];
  const value = rows[i]?.[metricIndex];
  if (isEmpty(value)) {
    return null;
  }

  // format latest value and date
  const formatOptions = settings.column?.(metricColumn);
  const valueStr = formatValue(value, formatOptions);
  const dateStr = formatDateTimeRangeWithUnit([date], dateUnit, {
    compact: true,
  });

  const clicked = {
    value,
    column: cols[dimensionIndex],
    dimensions: [
      {
        value: rows[i][dimensionIndex],
        column: cols[dimensionIndex],
      },
    ],
    data: rows[i].map((value, index) => ({
      value,
      col: cols[index],
    })),
    settings,
  };

  const comparison = computePreviousPeriodComparison({
    rows,
    dimensionIndex,
    metricIndex,
    nextValue: value,
    nextDate: date,
    dateUnit,
    formatOptions,
    settings,
  });

  return {
    value,
    clicked,
    formatOptions,
    display: {
      value: valueStr,
      date: dateStr,
    },
    comparison,
  };
}

// compute the percent change between two values (prevVal → nextVal)
// percentChange = (nextVal - prevVal) / Math.abs(prevVal)
export function computeChange(prevVal, nextVal) {
  if (prevVal === 0) {
    // percentChange = nextVal / 0
    return nextVal === 0 ? 0 : nextVal > 0 ? Infinity : -Infinity;
  }

  return (nextVal - prevVal) / Math.abs(prevVal);
}

export const PREVIOUS_VALUE_OPTIONS = {
  MISSING: "PREVIOUS_VALUE_MISSING",
  SAME: "PREVIOUS_VALUE_SAME",
  CHANGED: "PREVIOUS_VALUE_CHANGED",
};

function computeChangeTypeWithOptions({
  formatOptions,
  percentChange,
  prevValue,
}) {
  if (isEmpty(prevValue)) {
    return {
      comparisonType: PREVIOUS_VALUE_OPTIONS.MISSING,
      percentChangeStr: t`N/A`,
      prevValueStr: t`(empty)`,
    };
  }

  if (percentChange === 0) {
    return {
      comparisonType: PREVIOUS_VALUE_OPTIONS.SAME,
      percentChangeStr: t`No change`,
      prevValueStr: "",
    };
  }

  return {
    comparisonType: PREVIOUS_VALUE_OPTIONS.CHANGED,
    changeArrow: percentChange < 0 ? "↓" : "↑",
    percentChangeStr: formatChange(percentChange),
    prevValueStr: formatValue(prevValue, formatOptions),
  };
}

function computePreviousPeriodComparison({
  rows,
  metricIndex,
  dimensionIndex,
  nextValue,
  nextDate,
  dateUnit,
  formatOptions,
  settings,
}) {
  const i = rows.findLastIndex(
    (row, i) => i < rows.length - 1 && !isEmpty(row[metricIndex]),
  );
  const prevDate = rows[i]?.[dimensionIndex];
  const prevValue = rows[i]?.[metricIndex];
  const percentChange = !isEmpty(prevValue)
    ? computeChange(prevValue, nextValue)
    : null;

  const dateUnitDisplay = Lib.describeTemporalUnit(dateUnit).toLowerCase();
  const datesAreSequential =
    !isEmpty(prevDate) &&
    moment
      .utc(prevDate)
      .startOf(dateUnit)
      .add(1, dateUnit)
      .isSame(moment.utc(nextDate).startOf(dateUnit));

  const comparisonPeriodStr =
    isEmpty(prevDate) || datesAreSequential
      ? t`previous ${dateUnitDisplay}`
      : computeComparisonPeriodStr({ dateUnit, nextDate, prevDate });

  const { comparisonType, changeArrow, percentChangeStr, prevValueStr } =
    computeChangeTypeWithOptions({
      formatOptions,
      percentChange,
      prevValue,
    });

  const arrowColorName = settings["scalar.switch_positive_negative"]
    ? { "↓": "success", "↑": "error" }
    : { "↓": "error", "↑": "success" };
  const changeColor = color(arrowColorName[changeArrow]);

  return {
    comparisonType,
    percentChange,
    prevValue,
    comparisonPeriodStr,
    changeColor,
    changeArrow,
    display: {
      percentChange: percentChangeStr,
      prevValue: prevValueStr,
    },
  };
}

function computeComparisonPeriodStr({ dateUnit, prevDate, nextDate }) {
  const isSameDay = moment(prevDate).isSame(nextDate, "day");
  const isSameYear = moment(prevDate).isSame(nextDate, "year");

  return formatDateTimeRangeWithUnit([prevDate], dateUnit, {
    compact: true,
    removeDay: isSameDay,
    removeYear: isSameYear,
  });
}
