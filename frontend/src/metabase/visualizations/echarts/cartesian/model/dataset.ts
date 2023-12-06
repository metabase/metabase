import type { DatasetColumn, RawSeries, RowValue } from "metabase-types/api";
import type { DataKey } from "metabase/visualizations/echarts/cartesian/model/types";
import type { CartesianChartColumns } from "metabase/visualizations/lib/graph/columns";
import { isMetric } from "metabase-lib/types/utils/isa";

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
 * Creates a unique series key for a dataset based on the provided column, card ID, and optional breakout value.
 * For unsaved questions without cardId the format is "columnName" or "breakoutValue:columnName" for breakout series.
 * For saved questions keys include "cardId:" prefix.
 *
 * @param {DatasetColumn} column - The series metric column.
 * @param {number | undefined} cardId - The ID of the card.
 * @param {RowValue} [breakoutValue] - An optional breakout value when two dimensions columns are selected.
 * @returns {string} A unique key for the series.
 */
export const getDatasetKey = (
  column: DatasetColumn,
  cardId: number | undefined,
  breakoutValue?: RowValue,
): string => {
  const cardIdPart = cardId != null ? `${cardId}:` : "";
  const breakoutPart =
    typeof breakoutValue !== "undefined" ? `${breakoutValue}:` : "";
  const columnNamePart = column.name;

  return `${cardIdPart}${breakoutPart}${columnNamePart}`;
};

/**
 * Aggregates metric column values in a datum for a given row.
 * When a breakoutIndex is specified it aggregates metrics per breakout value.
 *
 * @param {Record<DataKey, RowValue>} datum - The datum object to aggregate metric values.
 * @param {DatasetColumn[]} columns - The columns of the raw dataset.
 * @param {RowValue[]} row - The raw row of values.
 * @param {number} cardId - The ID of the card.
 * @param {number} [breakoutIndex] - The breakout column index for charts with two dimension columns selected.
 */
const aggregateMetricsForDatum = (
  datum: Record<DataKey, RowValue>,
  columns: DatasetColumn[],
  row: RowValue[],
  cardId: number,
  breakoutIndex?: number,
): void => {
  columns.forEach((column, columnIndex) => {
    if (!isMetric(column)) {
      return;
    }

    const rowValue = row[columnIndex];
    const seriesKey = getDatasetKey(column, cardId);
    datum[seriesKey] = sumMetric(datum[seriesKey], rowValue);

    if (breakoutIndex != null) {
      const breakoutValue = row[breakoutIndex];
      const breakoutSeriesKey = getDatasetKey(column, cardId, breakoutValue);
      datum[breakoutSeriesKey] = sumMetric(datum[breakoutSeriesKey], rowValue);
    }
  });
};

/**
 * Accepts merged raw cards and raw datasets, groups and joins the metric columns on the dimension column
 * of each card.
 *
 * @param {RawSeries} rawSeries - An array of raw cards merged with raw datasets.
 * @param {CartesianChartColumns[]} cardsColumns - The column descriptors of each card.
 * @returns {Record<DataKey, RowValue>[]} The aggregated dataset.
 */
export const getJoinedCardsDataset = (
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
    const dimensionDataKey = getDatasetKey(dimensionColumn, cardId);

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

      aggregateMetricsForDatum(datum, cols, row, cardId, breakoutIndex);
    }
  });

  return Array.from(groupedData.values());
};
