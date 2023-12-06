import type { DatasetColumn, RawSeries, RowValue } from "metabase-types/api";
import type {
  DataKey,
  GroupedDataset,
  SeriesExtents,
  SeriesModel,
} from "metabase/visualizations/echarts/cartesian/model/types";
import type { CartesianChartColumns } from "metabase/visualizations/lib/graph/columns";
import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
import { isEmpty } from "metabase/lib/validate";
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

/**
 * Sorts the series models based on the order specified in the "graph.series_order" property of visualization settings.
 * It defines the breakout series order so that charts where all series are metrics without breakouts do not
 * rely on this property, and the series are sorted based on the metrics order in the original MBQL query.
 *
 * @param {SeriesModel[]} seriesModels - The array of series models to be sorted.
 * @param {ComputedVisualizationSettings} settings - The computed visualization settings.
 * @returns {SeriesModel[]} The sorted array of series models.
 */
export const getSortedSeriesModels = (
  seriesModels: SeriesModel[],
  settings: ComputedVisualizationSettings,
) => {
  const breakoutSeriesOrder = settings["graph.series_order"];
  if (breakoutSeriesOrder == null || breakoutSeriesOrder.length === 0) {
    return seriesModels;
  }

  const orderedSeriesModels = breakoutSeriesOrder
    .filter(orderSetting => orderSetting.enabled)
    .map(orderSetting => {
      const foundSeries = seriesModels.find(
        seriesModel => seriesModel.vizSettingsKey === orderSetting.key,
      );
      if (foundSeries === undefined) {
        throw new TypeError("Series not found");
      }
      return foundSeries;
    });

  // On stacked charts we reverse the order of series so that the series
  // order in the sidebar matches series order on the chart
  const isReversed = !isEmpty(settings["stackable.stack_type"]);
  if (isReversed) {
    orderedSeriesModels.reverse();
  }

  return orderedSeriesModels;
};

type ReplacerFn = (dataKey: string, value: RowValue) => RowValue;

/**
 * Creates a new dataset with the values replaced according to the provided replacer function.
 *
 * @param {Record<DataKey, RowValue>[]} dataset - The original dataset.
 * @param {ReplacerFn} replacer - The function that will be used to replace values.
 * @returns {Record<DataKey, RowValue>[]} A new dataset with the replaced values.
 */
export const replaceValues = (
  dataset: Record<DataKey, RowValue>[],
  replacer: ReplacerFn,
) => {
  return dataset.map(datum => {
    return Object.keys(datum).reduce((updatedRow, dataKey) => {
      updatedRow[dataKey] = replacer(dataKey, datum[dataKey]);
      return updatedRow;
    }, {} as Record<DataKey, RowValue>);
  });
};

/**
 * Creates a replacer function that replaces null values with zeros for specified series.
 *
 * @param {ComputedVisualizationSettings} settings - The computed visualization settings.
 * @param {SeriesModel[]} seriesModels - The series models for the chart.
 * @returns {ReplacerFn} A replacer function that replaces null values with zeros for specified series.
 */
export const getNullReplacerFunction = (
  settings: ComputedVisualizationSettings,
  seriesModels: SeriesModel[],
): ReplacerFn => {
  const replaceNullsWithZeroDataKeys = seriesModels.reduce(
    (seriesDataKeys, seriesModel) => {
      const shouldReplaceNullsWithZeros =
        settings.series(seriesModel.legacySeriesSettingsObjectKey)[
          "line.missing"
        ] === "zero";

      if (shouldReplaceNullsWithZeros) {
        seriesDataKeys.add(seriesModel.dataKey);
      }

      return seriesDataKeys;
    },
    new Set<DataKey>(),
  );

  return (dataKey, value) => {
    if (replaceNullsWithZeroDataKeys.has(dataKey) && value === null) {
      return 0;
    }

    return value;
  };
};

const getNumericValue = (value: RowValue): number =>
  typeof value === "number" ? value : 0;

const computeTotal = (
  row: Record<DataKey, RowValue>,
  keys: DataKey[],
): number => keys.reduce((total, key) => total + getNumericValue(row[key]), 0);

/**
 * Creates a new normalized dataset for the specified series keys, where the values of each series
 * are represented as percentages of their total sum for a given dimension value.
 * This normalized dataset is necessary for rendering normalized stacked bar and area charts,
 * where each series value contributes to a percentage of the whole for that specific dimension value.
 *
 * @param {Record<DataKey, RowValue>[]} groupedData - The original non-normalized dataset.
 * @param {DataKey[]} normalizedSeriesKeys - The keys of the series to normalize.
 * @param {DataKey} dimensionKey - The key of the dimension value to include in the normalized dataset.
 * @returns {Record<DataKey, RowValue>[]} The normalized dataset.
 */
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
    return normalizedSeriesKeys.reduce((acc, key) => {
      const numericValue = getNumericValue(row[key]);
      acc[key] = numericValue / total;
      return acc;
    }, normalizedDatum);
  });
};

/**
 * Calculates the minimum and maximum values (extents) for each series in the dataset.
 *
 * @param {DataKey[]} keys - The keys of the series to calculate extents for.
 * @param {GroupedDataset} dataset - The dataset containing the series data.
 * @returns {SeriesExtents} Series extent by a series data key.
 */
export const getDatasetExtents = (
  keys: DataKey[],
  dataset: GroupedDataset,
): SeriesExtents => {
  const extents: SeriesExtents = {};

  dataset.forEach(item => {
    keys.forEach(key => {
      const value = item[key];

      if (typeof value !== "number" || !Number.isFinite(value)) {
        return;
      }

      const extent = extents[key];

      if (!extent) {
        extents[key] = [value, value];
        return;
      }

      if (value < extent[0]) {
        extent[0] = value;
      }

      if (value > extent[1]) {
        extent[1] = value;
      }
    });
  });

  return extents;
};
