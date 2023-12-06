import dayjs from "dayjs";
import { t } from "ttag";
import * as Lib from "metabase-lib";
import { formatValue } from "metabase/lib/formatting/value";
import { formatDateTimeRangeWithUnit } from "metabase/lib/formatting/date";
import { color } from "metabase/lib/colors";
import {
  COMPARISON_TYPES,
  formatChange,
} from "metabase/visualizations/visualizations/SmartScalar/utils";
import { isEmpty } from "metabase/lib/validate";
import { isDate } from "metabase-lib/types/utils/isa";

const FALLBACK_DATE_UNIT = "day";

export function computeTrend(series, insights, settings) {
  const { type } = settings["scalar.comparisons"];

  if (type === COMPARISON_TYPES.PREVIOUS_VALUE) {
    return computeTrendPreviousValue(series, insights, settings);
  }

  if (
    [COMPARISON_TYPES.PREVIOUS_PERIOD, COMPARISON_TYPES.PERIODS_AGO].includes(
      type,
    )
  ) {
    return computeTrendPeriodsAgo(series, insights, settings);
  }

  return null;
}

function computeTrendPreviousValue(series, insights, settings) {
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

  if (dimensionIndex === -1 || metricIndex === -1) {
    return null;
  }

  // get metric column metadata
  const metricColumn = cols[metricIndex];
  const metricInsight = insights?.find(
    insight => insight.col === metricColumn.name,
  );

  // get latest value and date
  const i = rows.length - 1;
  const date = rows[i][dimensionIndex];
  const value = rows[i][metricIndex];

  if (isEmpty(value) || isEmpty(date)) {
    return null;
  }

  const insightDateUnit = metricInsight?.unit;

  // format latest value and date
  const formatOptions = settings.column?.(metricColumn);
  const valueStr = formatValue(value, formatOptions);

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

  const comparison = computeComparisonPreviousValue({
    rows,
    dimensionIndex,
    metricIndex,
    nextValue: value,
    nextDate: date,
    insightDateUnit,
    formatOptions,
    settings,
  });

  // if insightDateUnit is not supplied and there is no previous value to compare
  // to, we have to set a fallback dateUnit to display for the current value
  const { dateUnit } = comparison;
  const dateStr = formatDateTimeRangeWithUnit([date], dateUnit, {
    compact: true,
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

function computeComparisonPreviousValue({
  rows,
  metricIndex,
  dimensionIndex,
  nextValue,
  nextDate,
  insightDateUnit,
  formatOptions,
  settings,
}) {
  const previousRow = rows.findLast(
    (row, i) =>
      i < rows.length - 1 &&
      !isEmpty(row[metricIndex]) &&
      !isEmpty(row[dimensionIndex]),
  );
  // if no row exists with non-null date and non-null value
  if (isEmpty(previousRow)) {
    const { comparisonType, percentChangeStr, prevValueStr } =
      computeChangeTypeWithOptions({
        formatOptions,
      });

    return {
      comparisonType,
      dateUnit: insightDateUnit ?? FALLBACK_DATE_UNIT,
      display: {
        percentChange: percentChangeStr,
        prevValue: prevValueStr,
      },
    };
  }

  const prevDate = previousRow[dimensionIndex];
  const prevValue = previousRow[metricIndex];
  const percentChange = computeChange(prevValue, nextValue);
  const {
    comparisonType,
    changeArrowIconName,
    percentChangeStr,
    prevValueStr,
  } = computeChangeTypeWithOptions({
    formatOptions,
    percentChange,
    prevValue,
  });
  const changeColor = getArrowColor(
    changeArrowIconName,
    settings["scalar.switch_positive_negative"],
  );

  const dateUnit = insightDateUnit ?? getDatePrecision(prevDate, nextDate);
  const comparisonPeriodStr = computeComparisonStrPreviousValue({
    nextDate,
    prevDate,
    dateUnit,
  });

  return {
    comparisonType,
    percentChange,
    prevValue,
    comparisonPeriodStr,
    changeColor,
    changeArrowIconName,
    dateUnit,
    display: {
      percentChange: percentChangeStr,
      prevValue: prevValueStr,
    },
  };
}

function computeTrendPeriodsAgo(series, insights, settings) {
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

  if (dimensionIndex === -1 || metricIndex === -1) {
    return null;
  }

  // get metric column metadata
  const metricColumn = cols[metricIndex];
  const metricInsight = insights?.find(
    insight => insight.col === metricColumn.name,
  );

  const dateUnit = metricInsight?.unit;

  if (isEmpty(dateUnit)) {
    return null;
  }

  // get latest value and date
  const i = rows.length - 1;
  const date = rows[i][dimensionIndex];
  const value = rows[i][metricIndex];
  if (isEmpty(value) || isEmpty(date)) {
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

  const comparison = computeComparisonPeriodsAgo({
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

function computeComparisonPeriodsAgo({
  rows,
  metricIndex,
  dimensionIndex,
  nextValue,
  nextDate,
  dateUnit,
  formatOptions,
  settings,
}) {
  const dateUnitDisplay = Lib.describeTemporalUnit(dateUnit).toLowerCase();
  const dateUnitsAgo = settings["scalar.comparisons"].value ?? 1;
  const prevDate = dayjs(nextDate)
    .subtract(dateUnitsAgo, dateUnit)
    .format("YYYY-MM-DDTHH:mm:ssZ");

  const comparisonPeriodStr =
    dateUnitsAgo === 1
      ? t`vs. previous ${dateUnitDisplay}`
      : computeComparisonStrPreviousValue({
          dateUnit,
          nextDate,
          prevDate,
        });

  const rowIndexPeriodsAgo = getIndexOfPeriodsAgo({
    prevDate,
    dateUnitsAgo,
    dimensionIndex,
    rows,
  });
  // if no row exists with date "X periods ago"
  if (rowIndexPeriodsAgo === -1) {
    const { comparisonType, percentChangeStr, prevValueStr } =
      computeChangeTypeWithOptions({
        formatOptions,
      });

    return {
      comparisonType,
      comparisonPeriodStr,
      display: {
        percentChange: percentChangeStr,
        prevValue: prevValueStr,
      },
    };
  }

  const prevValue = rows[rowIndexPeriodsAgo][metricIndex];
  // if row "X periods ago" exists but contains null values
  if (isEmpty(prevValue)) {
    const { comparisonType, percentChangeStr, prevValueStr } =
      computeChangeTypeWithOptions({
        formatOptions,
      });

    return {
      comparisonType,
      comparisonPeriodStr,
      display: {
        percentChange: percentChangeStr,
        prevValue: prevValueStr,
      },
    };
  }

  // if data exists and is non-null, compute change
  const percentChange = computeChange(prevValue, nextValue);
  const {
    comparisonType,
    changeArrowIconName,
    percentChangeStr,
    prevValueStr,
  } = computeChangeTypeWithOptions({
    formatOptions,
    percentChange,
    prevValue,
  });
  const changeColor = getArrowColor(
    changeArrowIconName,
    settings["scalar.switch_positive_negative"],
  );

  return {
    comparisonType,
    percentChange,
    prevValue,
    comparisonPeriodStr,
    changeColor,
    changeArrowIconName,
    display: {
      percentChange: percentChangeStr,
      prevValue: prevValueStr,
    },
  };
}

function getIndexOfPeriodsAgo({
  prevDate,
  dateUnitsAgo,
  dimensionIndex,
  rows,
}) {
  const date = dayjs(prevDate);
  // skip the last element since that is our current value
  const searchIndexStart = rows.length - 2;
  if (searchIndexStart < 0) {
    return -1;
  }

  // only look dateUnitsAgo elements (dates) into the past,
  // since looking any further would automatically result in a date before
  // X periods ago and any prior dates would be further beyond our desired
  // comparison date
  const lastSearchCandidate = rows.length - 2 - (dateUnitsAgo - 1);
  const searchIndexEnd = lastSearchCandidate >= 0 ? lastSearchCandidate : 0;

  for (let i = searchIndexStart; i >= searchIndexEnd; i--) {
    const row = rows[i];
    const rowDate = row[dimensionIndex];

    if (date.isSame(rowDate)) {
      return i;
    }

    if (date.isAfter(rowDate)) {
      return -1;
    }
  }

  return -1;
}

function computeComparisonStrPreviousValue({ dateUnit, prevDate, nextDate }) {
  const isSameDay = dayjs(prevDate).isSame(nextDate, "day");
  const isSameYear = dayjs(prevDate).isSame(nextDate, "year");

  const formattedDateStr = formatDateTimeRangeWithUnit([prevDate], dateUnit, {
    compact: true,
    removeDay: isSameDay,
    removeYear: isSameYear,
  });

  return t`vs. ${formattedDateStr}`;
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
      prevValueStr: t`(No data)`,
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
    changeArrowIconName: percentChange < 0 ? "arrow_down" : "arrow_up",
    percentChangeStr: formatChange(percentChange),
    prevValueStr: formatValue(prevValue, formatOptions),
  };
}

function getArrowColor(changeArrowIconName, shouldSwitchPositiveNegative) {
  const arrowIconColorNames = shouldSwitchPositiveNegative
    ? { arrow_down: "success", arrow_up: "error" }
    : { arrow_down: "error", arrow_up: "success" };

  return color(arrowIconColorNames[changeArrowIconName]);
}

// find the smallest unit different between each date and use that to
// determine the dateUnit
function getDatePrecision(prevDateStr, nextDateStr) {
  const optionsToDiff = ["year", "month", "day", "hour", "minute"];

  const prevDate = dayjs(prevDateStr);
  const nextDate = dayjs(nextDateStr);

  let dateUnit = "year";
  let diffDate = nextDate;

  optionsToDiff.forEach(unit => {
    const diff = diffDate.diff(prevDate, unit);

    // if the dates have the same day of month, hour of day, minute of hour
    // then it will have a diff 0, so we will still need to check if one
    // of the dates have a non-zero value there
    if (diff > 0 || nextDate?.[unit]() > 0) {
      dateUnit = unit;
    }

    diffDate = diffDate.subtract(diff, unit);
  });

  return dateUnit;
}
