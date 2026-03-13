import { useMemo } from "react";
import { t } from "ttag";

import { formatValue } from "metabase/lib/formatting";
import { formatDateTimeRangeWithUnit } from "metabase/lib/formatting/date";
import { isEmpty } from "metabase/lib/validate";
import { computeChange } from "metabase/visualizations/lib/numeric";
import { formatPreviousPeriodOptionName } from "metabase/visualizations/visualizations/SmartScalar/utils";
import { isDate, isNumeric } from "metabase-lib/v1/types/utils/isa";
import type { Dataset } from "metabase-types/api";
import { isAbsoluteDateTimeUnit } from "metabase-types/guards/date-time";

type TrendData = {
  value: string;
  dateLabel: string;
  change?: {
    percent: number;
    description: string;
  };
};

export function useTrendData(data: Dataset | undefined): TrendData | null {
  return useMemo(() => {
    if (!data) {
      return null;
    }
    return computeTrendData(data);
  }, [data]);
}

function computeTrendData(dataset: Dataset): TrendData | null {
  const { rows, cols, insights } = dataset.data;

  const dateColumnIndex = cols.findIndex(
    (column) => isDate(column) || isAbsoluteDateTimeUnit(column.unit),
  );
  const metricColumnIndex = cols.findIndex((column) => isNumeric(column));

  if (dateColumnIndex === -1 || metricColumnIndex === -1 || rows.length === 0) {
    return null;
  }

  const metricColumn = cols[metricColumnIndex];
  const dateColumn = cols[dateColumnIndex];

  const latestRowIndex = findLastNonEmptyRow(
    rows,
    dateColumnIndex,
    metricColumnIndex,
  );
  if (latestRowIndex === -1) {
    return null;
  }

  const latestValue = rows[latestRowIndex][metricColumnIndex];
  const latestDate = rows[latestRowIndex][dateColumnIndex] as string;

  const formattedValue = formatValue(latestValue, { column: metricColumn });
  const dateUnit =
    insights?.find((insight) => insight.col === metricColumn.name)?.unit ??
    dateColumn.unit;

  const formattedDate =
    dateUnit && isAbsoluteDateTimeUnit(dateUnit)
      ? formatDateTimeRangeWithUnit([latestDate], dateUnit, { compact: true })
      : formatValue(latestDate, { column: dateColumn });

  const change = computePreviousPeriodChange(
    rows,
    dateColumnIndex,
    metricColumnIndex,
    latestRowIndex,
    latestValue,
    dateUnit,
  );

  return {
    value: String(formattedValue),
    dateLabel: String(formattedDate),
    change,
  };
}

function findLastNonEmptyRow(
  rows: unknown[][],
  dateColumnIndex: number,
  metricColumnIndex: number,
): number {
  for (let index = rows.length - 1; index >= 0; index--) {
    const date = rows[index][dateColumnIndex];
    const value = rows[index][metricColumnIndex];
    if (!isEmpty(value) && !isEmpty(date)) {
      return index;
    }
  }
  return -1;
}

function computePreviousPeriodChange(
  rows: unknown[][],
  dateColumnIndex: number,
  metricColumnIndex: number,
  latestRowIndex: number,
  currentValue: unknown,
  dateUnit: string | undefined,
): TrendData["change"] {
  const previousRowIndex = findPreviousNonEmptyRow(
    rows,
    dateColumnIndex,
    metricColumnIndex,
    latestRowIndex,
  );

  if (previousRowIndex === -1) {
    return undefined;
  }

  const previousValue = rows[previousRowIndex][metricColumnIndex];
  if (isEmpty(previousValue) || typeof previousValue !== "number") {
    return undefined;
  }

  const percent = computeChange(previousValue, currentValue);
  if (!isFinite(percent)) {
    return undefined;
  }

  const description =
    dateUnit && isAbsoluteDateTimeUnit(dateUnit)
      ? t`compared to ${formatPreviousPeriodOptionName(dateUnit).toLocaleLowerCase()}`
      : t`compared to previous value`;

  return { percent, description };
}

function findPreviousNonEmptyRow(
  rows: unknown[][],
  dateColumnIndex: number,
  metricColumnIndex: number,
  beforeIndex: number,
): number {
  for (let index = beforeIndex - 1; index >= 0; index--) {
    const date = rows[index][dateColumnIndex];
    const value = rows[index][metricColumnIndex];
    if (!isEmpty(value) && !isEmpty(date)) {
      return index;
    }
  }
  return -1;
}
