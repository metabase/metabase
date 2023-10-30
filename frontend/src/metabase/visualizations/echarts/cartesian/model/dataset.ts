import type { DatasetColumn, RawSeries, RowValue } from "metabase-types/api";
import type {
  DataKey,
  GroupedDataset,
} from "metabase/visualizations/echarts/cartesian/model/types";
import type { CartesianChartColumns } from "metabase/visualizations/lib/graph/columns";
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

export const getDatasetKey = ({
  column,
  breakoutValue,
  cardId,
}: {
  column: DatasetColumn;
  breakoutValue?: RowValue;
  cardId?: number;
}) => {
  let key = cardId != null ? `${cardId}:` : "";

  key +=
    typeof breakoutValue === "undefined"
      ? column.name
      : `${breakoutValue}:${column.name}`;

  return key;
};

export const getGroupedData = (
  rawSeries: RawSeries,
  cardsColumns: CartesianChartColumns[],
): Record<DataKey, RowValue>[] => {
  const groupedData = new Map<RowValue, Record<DataKey, RowValue>>();

  rawSeries.forEach((cardSeries, index) => {
    const {
      card,
      data: { rows, cols },
    } = cardSeries;
    const columns = cardsColumns[index];

    const cardId = card.id;

    const dimensionIndex = columns.dimension.index;
    const dimensionColumn = cols[dimensionIndex];
    const dimensionDataKey = getDatasetKey({
      column: dimensionColumn,
      cardId,
    });

    const breakoutIndex =
      "breakout" in columns ? columns.breakout.index : undefined;

    for (const row of rows) {
      const dimensionValue = row[dimensionIndex];

      // Get the existing datum by the dimension value if exists
      const datum = groupedData.get(dimensionValue) ?? {
        [dimensionDataKey]: dimensionValue,
      };

      if (!groupedData.has(dimensionValue)) {
        groupedData.set(dimensionValue, datum);
      }

      cols.forEach((column, columnIndex) => {
        const rowValue = row[columnIndex];
        const seriesKey = getDatasetKey({ column, cardId });

        // Aggregate values of metric columns, simply, ones with summable numbers
        if (isMetric(column)) {
          datum[seriesKey] = sumMetric(datum[seriesKey], rowValue);

          // If breakout is defined, create an additional series key for each breakout
          if (breakoutIndex != null) {
            const breakoutSeriesKey = getDatasetKey({
              column,
              breakoutValue: row[breakoutIndex],
              cardId,
            });
            datum[breakoutSeriesKey] = sumMetric(
              datum[breakoutSeriesKey],
              rowValue,
            );
          }
        }
      });
    }
  });

  return Array.from(groupedData.values());
};

const getNumericValue = (value: RowValue): number =>
  typeof value === "number" ? value : 0;

const computeTotal = (
  row: Record<DataKey, RowValue>,
  keys: DataKey[],
): number => keys.reduce((total, key) => total + getNumericValue(row[key]), 0);

export const getNormalizedDataset = (
  groupedData: Record<DataKey, RowValue>[],
  normalizedSeriesKeys: DataKey[],
  dimensionKey: DataKey,
): Record<DataKey, RowValue>[] => {
  return groupedData.map(row => {
    const total = computeTotal(row, normalizedSeriesKeys);

    // Copy the dimension value
    const normalizedDatum: Record<DataKey, RowValue> = {
      [dimensionKey]: row[dimensionKey],
    };

    // Compute normalized values for metrics
    return normalizedSeriesKeys.reduce((normalizedRow, key) => {
      const numericValue = getNumericValue(row[key]);
      normalizedRow[key] = numericValue / total;
      return normalizedRow;
    }, normalizedDatum);
  });
};

export const getDatasetExtents = (keys: DataKey[], dataset: GroupedDataset) => {
  const extents: Record<DataKey, [number, number]> = {};

  dataset.forEach(item => {
    for (const key in item) {
      const value = item[key];

      if (typeof value !== "number" || !Number.isFinite(value)) {
        continue;
      }

      const extent = extents[key];

      if (!extent) {
        extents[key] = [value, value];
        continue;
      }

      if (value < extent[0]) {
        extent[0] = value;
      }
      if (value > extent[1]) {
        extent[1] = value;
      }
    }
  });

  return extents;
};
