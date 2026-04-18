import { useMemo } from "react";

import { formatValue } from "metabase/utils/formatting";
import { formatDateTimeRangeWithUnit } from "metabase/utils/formatting/date";
import type { PreviousPeriodChange } from "metabase/visualizations/lib/trend-helpers";
import {
  computePreviousPeriodChange,
  findPreviousNonEmptyRowIndex,
} from "metabase/visualizations/lib/trend-helpers";
import type { Dataset, DatasetColumn } from "metabase-types/api";
import { isAbsoluteDateTimeUnit } from "metabase-types/guards/date-time";

type TrendData = {
  value: string;
  dateLabel: string;
  change?: PreviousPeriodChange;
};

export function useTrendData(
  data: Dataset | undefined,
  dateColumnIndex: number,
  metricColumnIndex: number,
): TrendData | null {
  return useMemo(() => {
    if (!data) {
      return null;
    }
    return computeTrendData(data, dateColumnIndex, metricColumnIndex);
  }, [data, dateColumnIndex, metricColumnIndex]);
}

function computeTrendData(
  dataset: Dataset,
  dateColumnIndex: number,
  metricColumnIndex: number,
): TrendData | null {
  const { rows, cols, insights } = dataset.data;

  if (rows.length === 0) {
    return null;
  }

  const metricColumn = cols[metricColumnIndex];
  const dateColumn = cols[dateColumnIndex];
  if (!metricColumn || !dateColumn) {
    return null;
  }

  const latestRowIndex = findPreviousNonEmptyRowIndex(
    rows,
    dateColumnIndex,
    metricColumnIndex,
    rows.length,
  );
  if (latestRowIndex === -1) {
    return null;
  }

  const latestValue = rows[latestRowIndex][metricColumnIndex];
  const latestDate = rows[latestRowIndex][dateColumnIndex] as string;

  const formattedValue = formatValue(latestValue, { column: metricColumn });
  const dateUnit = resolveDateUnit(metricColumn, dateColumn, insights);

  const formattedDate = formatDate(latestDate, dateColumn, dateUnit);

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

function resolveDateUnit(
  metricColumn: DatasetColumn,
  dateColumn: DatasetColumn,
  insights: Dataset["data"]["insights"],
): string | undefined {
  return (
    insights?.find((insight) => insight.col === metricColumn.name)?.unit ??
    dateColumn.unit
  );
}

function formatDate(
  date: string,
  dateColumn: DatasetColumn,
  dateUnit: string | undefined,
): string {
  if (dateUnit && isAbsoluteDateTimeUnit(dateUnit)) {
    return String(
      formatDateTimeRangeWithUnit([date], dateUnit, { compact: true }),
    );
  }
  return String(formatValue(date, { column: dateColumn }));
}
