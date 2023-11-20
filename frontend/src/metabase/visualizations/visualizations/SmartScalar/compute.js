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
      type: PREVIOUS_VALUE_OPTIONS.MISSING,
      changeStr: t`N/A`,
      valueStr: t`(empty)`,
    };
  }

  if (percentChange === 0) {
    return {
      type: PREVIOUS_VALUE_OPTIONS.SAME,
      changeStr: t`No change`,
      valueStr: "",
    };
  }

  return {
    type: PREVIOUS_VALUE_OPTIONS.CHANGED,
    changeArrow: percentChange < 0 ? "↓" : "↑",
    changeStr: formatChange(percentChange),
    valueStr: formatValue(prevValue, formatOptions),
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

  const title =
    isEmpty(prevDate) || datesAreSequential
      ? t`previous ${dateUnitDisplay}`
      : formatDateTimeRangeWithUnit([prevDate], dateUnit, { compact: true }); // FIXME: elide part of the prevDate in common with lastDate

  const { type, changeArrow, changeStr, valueStr } =
    computeChangeTypeWithOptions({
      formatOptions,
      percentChange,
      prevValue,
    });

  const arrowColorName = !settings["scalar.switch_positive_negative"]
    ? { "↓": "error", "↑": "success" }
    : { "↓": "success", "↑": "error" };
  const changeColor = color(arrowColorName[changeArrow]);

  return {
    type,
    percentChange,
    prevValue,
    title,
    changeColor,
    changeArrow,
    display: {
      change: changeStr,
      value: valueStr,
    },
  };
}

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

  // get last value and date
  const i = rows.length - 1;
  const date = rows[i]?.[dimensionIndex];
  const value = rows[i]?.[metricIndex];
  if (isEmpty(value)) {
    return null;
  }

  // format last value and date
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
        value: rows[rows.length - 1][dimensionIndex],
        column: cols[dimensionIndex],
      },
    ],
    data: rows[rows.length - 1].map((value, index) => ({
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
