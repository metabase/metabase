import type { DatasetColumn, RowValue, RowValues } from "metabase-types/api";
import type { DataKey } from "metabase/visualizations/echarts/cartesian/model/types";
import { isMetric } from "metabase-lib/types/utils/isa";

export const sumMetric = (left: RowValue, right: RowValue) => {
  if (typeof left === "number" && typeof right === "number") {
    return left + right;
  } else if (typeof left === "number") {
    return left;
  } else if (typeof right === "number") {
    return right;
  }

  return null;
};

export const getDatasetSeriesKey = (
  column: DatasetColumn,
  breakoutValue?: RowValue,
) => {
  return typeof breakoutValue === "undefined"
    ? column.name
    : `${breakoutValue}:${column.name}`;
};

export const groupDataset = (
  rows: RowValues[],
  cols: DatasetColumn[],
  dimensionIndex: number,
  breakoutIndex?: number,
) => {
  const dimensionColumn = cols[dimensionIndex];
  const groupedData = new Map<RowValue, Record<DataKey, RowValue>>();

  for (const row of rows) {
    const dimensionValue = row[dimensionIndex];
    const datum = groupedData.get(dimensionValue) ?? {
      [dimensionColumn.name]: dimensionValue,
    };

    if (!groupedData.has(dimensionValue)) {
      groupedData.set(dimensionValue, datum);
    }

    cols.forEach((column, columnIndex) => {
      const rowValue = row[columnIndex];
      const seriesKey = getDatasetSeriesKey(column);

      if (isMetric(column)) {
        datum[seriesKey] = sumMetric(datum[seriesKey], rowValue);

        if (breakoutIndex != null) {
          const breakoutSeriesKey = getDatasetSeriesKey(
            column,
            row[breakoutIndex],
          );
          datum[breakoutSeriesKey] = sumMetric(
            datum[breakoutSeriesKey],
            rowValue,
          );
        }
      }
    });
  }

  return Array.from(groupedData.values());
};
