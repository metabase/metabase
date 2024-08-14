import { isNotNull } from "metabase/lib/types";
import { isMetric } from "metabase-lib/v1/types/utils/isa";
import type {
  DatasetData,
  RawSeries,
  RowValue,
  RowValues,
} from "metabase-types/api";

/**
 * Sums two metric column values.
 *
 * @param left - A value to sum.
 * @param right - A value to sum.
 * @returns The sum of the two values unless both values are not numbers.
 */
export const sumMetric = (left: RowValue, right: RowValue): number | null => {
  if (typeof left === "number" && typeof right === "number") {
    return left + right;
  } else if (typeof left === "number") {
    return left;
  } else if (typeof right === "number") {
    return right;
  }

  return null;
};

/**
 * Groups dataset rows by specified columns and sums metric columns.
 *
 * @param data - The rows and columns from a dataset to group.
 * @param byColumns - The column name or an array of column names to group by.
 * @returns A new dataset with grouped rows and summed metric values.
 */
export const groupDatasetMetrics = (
  data: DatasetData,
  byColumns: string | string[],
): DatasetData => {
  const byColumnsNames = Array.isArray(byColumns) ? byColumns : [byColumns];
  const byColumnsIndices = byColumnsNames.map(name =>
    data.cols.findIndex(col => col.name === name),
  );

  const metricColumnsIndices = new Set(
    data.cols
      .map((col, index) => (isMetric(col) ? index : null))
      .filter(isNotNull),
  );

  const groupedData = new Map<string, RowValues>();

  for (const row of data.rows) {
    const groupKey = JSON.stringify(byColumnsIndices.map(index => row[index]));

    const existingRowForKey = groupedData.get(groupKey);
    if (!existingRowForKey) {
      groupedData.set(groupKey, [...row]);
      continue;
    }

    for (let i = 0; i < row.length; i++) {
      if (metricColumnsIndices.has(i)) {
        existingRowForKey[i] = sumMetric(existingRowForKey[i], row[i]);
      } else {
        existingRowForKey[i] ??= row[i];
      }
    }
  }

  return {
    ...data,
    cols: data.cols,
    rows: Array.from(groupedData.values()),
  };
};

export const groupRawSeriesMetrics = (
  rawSeries: RawSeries,
  byColumns?: string | string[],
): RawSeries => {
  if (!byColumns) {
    return rawSeries;
  }

  return rawSeries.map(singleSeries => ({
    ...singleSeries,
    data: groupDatasetMetrics(singleSeries.data, byColumns),
  }));
};
