import dayjs from "dayjs";
import type {
  DatasetColumn,
  RawSeries,
  RowValue,
  SingleSeries,
  XAxisScale,
} from "metabase-types/api";
import type {
  CartesianChartModel,
  DataKey,
  DimensionModel,
  Extent,
  ChartDataset,
  SeriesExtents,
  SeriesModel,
} from "metabase/visualizations/echarts/cartesian/model/types";
import type { CartesianChartColumns } from "metabase/visualizations/lib/graph/columns";
import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
import { isEmpty } from "metabase/lib/validate";

import { getBreakoutDistinctValues } from "metabase/visualizations/echarts/cartesian/model/series";
import { getObjectKeys, getObjectValues } from "metabase/lib/objects";
import { isNotNull } from "metabase/lib/types";
import {
  NEGATIVE_STACK_TOTAL_DATA_KEY,
  POSITIVE_STACK_TOTAL_DATA_KEY,
} from "metabase/visualizations/echarts/cartesian/constants/dataset";
import { isMetric, isNumeric } from "metabase-lib/types/utils/isa";

import { getXAxisType } from "../option/axis";

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
): DataKey => {
  const cardIdPart = cardId ?? null;
  const columnNamePart = column.name;

  const datasetKey: DataKey = `${cardIdPart}:${columnNamePart}`;

  if (typeof breakoutValue === "undefined") {
    return datasetKey;
  }

  return `${datasetKey}:${breakoutValue}`;
};

/**
 * Aggregates metric column values in a datum for a given row.
 * When a breakoutIndex is specified it aggregates metrics per breakout value.
 *
 * @param {Record<DataKey, RowValue>} datum - The datum object to aggregate metric values.
 * @param {DatasetColumn[]} columns - The columns of the raw dataset.
 * @param {RowValue[]} row - The raw row of values.
 * @param {number} cardId - The ID of the card.
 * @param {number} breakoutIndex - The breakout column index for charts with two dimension columns selected.
 */
const aggregateColumnValuesForDatum = (
  datum: Record<DataKey, RowValue>,
  columns: DatasetColumn[],
  row: RowValue[],
  cardId: number,
  dimensionIndex: number,
  breakoutIndex?: number,
): void => {
  columns.forEach((column, columnIndex) => {
    // The dimension values should not be aggregated, only metrics
    if (columnIndex === dimensionIndex) {
      return;
    }
    const rowValue = row[columnIndex];

    if (breakoutIndex == null || columnIndex === breakoutIndex) {
      const seriesKey = getDatasetKey(column, cardId);
      datum[seriesKey] = isMetric(column)
        ? sumMetric(datum[seriesKey], rowValue)
        : rowValue;
    } else {
      const breakoutValue = row[breakoutIndex];
      const breakoutSeriesKey = getDatasetKey(column, cardId, breakoutValue);
      datum[breakoutSeriesKey] = isMetric(column)
        ? sumMetric(datum[breakoutSeriesKey], rowValue)
        : rowValue;
    }
  });
};

/**
 * Accepts merged raw cards and raw datasets, groups and joins the metric columns on the dimension column
 * of each card.
 *
 * @param {RawSeries} rawSeries - An array of raw cards merged with raw datasets.
 * @param {CartesianChartColumns[]} cardsColumns - The column descriptors of each card.
 * @returns {ChartDataset} The aggregated dataset.
 */
export const getJoinedCardsDataset = (
  rawSeries: RawSeries,
  cardsColumns: CartesianChartColumns[],
): ChartDataset => {
  if (rawSeries.length === 0 || cardsColumns.length === 0) {
    return [];
  }

  const groupedData = new Map<RowValue, Record<DataKey, RowValue>>();
  const [mainCardColumns] = cardsColumns;
  const [mainSeries] = rawSeries;

  const dimensionDataKey = getDatasetKey(
    mainCardColumns.dimension.column,
    mainSeries.card.id,
  );

  rawSeries.forEach((cardSeries, index) => {
    const {
      card,
      data: { rows, cols },
    } = cardSeries;
    const columns = cardsColumns[index];

    const dimensionIndex = columns.dimension.index;
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

      aggregateColumnValuesForDatum(
        datum,
        cols,
        row,
        card.id,
        dimensionIndex,
        breakoutIndex,
      );
    }
  });

  return Array.from(groupedData.values());
};

type TransformFn = (
  record: Record<DataKey, RowValue>,
  index: number,
  dataset: ChartDataset,
) => Record<DataKey, RowValue>;

type ConditionalTransform = {
  condition: boolean;
  fn: TransformFn;
};

export const transformDataset = (
  dataset: ChartDataset,
  transforms: (TransformFn | ConditionalTransform)[],
): ChartDataset => {
  // Filter out transforms that don't apply
  const effectiveTransforms = transforms
    .map(transform => {
      if (typeof transform === "function") {
        return transform;
      } else if (transform.condition) {
        return transform.fn;
      } else {
        return null;
      }
    })
    .filter(isNotNull);

  // Apply the filtered transforms
  return dataset.map((record, index) => {
    return effectiveTransforms.reduce((acc, transform) => {
      return transform(acc, index, dataset);
    }, record);
  });
};

const getNumberOrZero = (value: RowValue): number =>
  typeof value === "number" ? value : 0;

export const computeTotal = (
  row: Record<DataKey, RowValue>,
  keys: DataKey[],
): number => keys.reduce((total, key) => total + getNumberOrZero(row[key]), 0);

export const getNormalizedDatasetTransform = (
  seriesDataKeys: DataKey[],
  dimensionKey: DataKey,
): TransformFn => {
  return datum => {
    const total = computeTotal(datum, seriesDataKeys);

    // Copy the dimension value
    const normalizedDatum: Record<DataKey, RowValue> = {
      [dimensionKey]: datum[dimensionKey],
    };

    // Compute normalized values for metrics
    return seriesDataKeys.reduce((acc, key) => {
      const numericValue = getNumberOrZero(datum[key]);
      acc[key] = numericValue / total;
      return acc;
    }, normalizedDatum);
  };
};

export const getKeyBasedDatasetTransform = (
  keys: DataKey[],
  valueTransform: (value: RowValue) => RowValue,
): TransformFn => {
  return datum => {
    const transformedRecord = { ...datum };
    for (const key of keys) {
      if (key in datum) {
        transformedRecord[key] = valueTransform(datum[key]);
      }
    }
    return transformedRecord;
  };
};

export const getNullReplacerTransform = (
  settings: ComputedVisualizationSettings,
  seriesModels: SeriesModel[],
): TransformFn => {
  const replaceNullsWithZeroDataKeys = seriesModels.reduce(
    (seriesDataKeys, seriesModel) => {
      const shouldReplaceNullsWithZeros =
        settings.series(seriesModel.legacySeriesSettingsObjectKey)[
          "line.missing"
        ] === "zero";

      if (shouldReplaceNullsWithZeros) {
        seriesDataKeys.push(seriesModel.dataKey);
      }

      return seriesDataKeys;
    },
    [] as DataKey[],
  );

  return getKeyBasedDatasetTransform(
    replaceNullsWithZeroDataKeys,
    (value: RowValue) => {
      return value === null ? 0 : value;
    },
  );
};

export const applySquareRootScaling = (value: RowValue): RowValue => {
  if (typeof value === "number") {
    const sign = value > 0 ? 1 : -1;
    return sign * Math.sqrt(Math.abs(value));
  }

  return value;
};

/**
 * Modifies the dataset for visualization according to the specified visualization settings.
 *
 * @param {ChartDataset} dataset The dataset to be transformed.
 * @param {SeriesModel[]} seriesModels Array of series models.
 * @param {ComputedVisualizationSettings} settings Computed visualization settings.
 * @param {DimensionModel} dimensionModel The dimension model.
 * @returns {ChartDataset} A transformed dataset.
 */
export const getTransformedDataset = (
  dataset: ChartDataset,
  seriesModels: SeriesModel[],
  settings: ComputedVisualizationSettings,
  dimensionModel: DimensionModel,
): ChartDataset => {
  const seriesDataKeys = seriesModels.map(seriesModel => seriesModel.dataKey);

  return transformDataset(dataset, [
    getNullReplacerTransform(settings, seriesModels),
    {
      condition: settings["stackable.stack_type"] === "normalized",
      fn: getNormalizedDatasetTransform(seriesDataKeys, dimensionModel.dataKey),
    },
    {
      condition: settings["graph.y_axis.scale"] === "pow",
      fn: getKeyBasedDatasetTransform(seriesDataKeys, applySquareRootScaling),
    },
    {
      condition: settings["graph.x_axis.scale"] === "pow",
      fn: getKeyBasedDatasetTransform(
        [dimensionModel.dataKey],
        applySquareRootScaling,
      ),
    },
    {
      condition: settings["stackable.stack_type"] != null,
      fn: datum => {
        return {
          ...datum,
          [POSITIVE_STACK_TOTAL_DATA_KEY]: Number.MIN_VALUE,
          [NEGATIVE_STACK_TOTAL_DATA_KEY]: -Number.MIN_VALUE,
        };
      },
    },
  ]);
};

export const sortDataset = (
  dataset: ChartDataset,
  dimensionKey: DataKey,
  xAxisScale?: XAxisScale,
) => {
  if (xAxisScale === "timeseries") {
    return sortByDimension(dataset, dimensionKey, (left, right) => {
      if (typeof left === "string" && typeof right === "string") {
        return dayjs(left).valueOf() - dayjs(right).valueOf();
      }
      return 0;
    });
  }

  if (xAxisScale !== "ordinal") {
    return sortByDimension(dataset, dimensionKey, (left, right) => {
      if (typeof left === "number" && typeof right === "number") {
        return left - right;
      }
      return 0;
    });
  }

  return dataset;
};

/**
 * Sorts a dataset by the specified time-series dimension.
 * @param {Record<DataKey, RowValue>[]} dataset The dataset to be sorted.
 * @param {DataKey} dimensionKey The time-series dimension key.
 * @param compareFn Sort compare function.
 * @returns A sorted dataset.
 */
const sortByDimension = (
  dataset: Record<DataKey, RowValue>[],
  dimensionKey: DataKey,
  compareFn: (a: RowValue, b: RowValue) => number,
): Record<DataKey, RowValue>[] => {
  return dataset.sort((left, right) => {
    return compareFn(left[dimensionKey], right[dimensionKey]);
  });
};

export function getDimensionDisplayValueGetter(
  chartModel: CartesianChartModel,
  settings: ComputedVisualizationSettings,
) {
  const axisType = getXAxisType(settings);
  const isPowerScale = settings["graph.x_axis.scale"] === "pow";

  return (value: string) => {
    if (isPowerScale) {
      return typeof value === "number" ? Math.pow(value, 2) : value;
    }
    if (axisType === "time") {
      return dayjs(value).format("YYYY-MM-DDTHH:mm:ss");
    }
    if (isNumeric(chartModel.dimensionModel.column)) {
      return parseInt(value, 10);
    }
    return value;
  };
}

export const getMetricDisplayValueGetter = (
  settings: ComputedVisualizationSettings,
) => {
  const isPowerScale = settings["graph.y_axis.scale"] === "pow";

  const powerScaleGetter = (value: RowValue) => {
    if (typeof value !== "number") {
      return value;
    }
    const sign = value > 0 ? 1 : -1;
    return Math.pow(value, 2) * sign;
  };

  return isPowerScale ? powerScaleGetter : (value: RowValue) => value;
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
): SeriesModel[] => {
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

type ReplacerFn = (dataKey: DataKey, value: RowValue) => RowValue;

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
    return getObjectKeys(datum).reduce((updatedRow, dataKey) => {
      updatedRow[dataKey] = replacer(dataKey, datum[dataKey]);
      return updatedRow;
    }, {} as Record<DataKey, RowValue>);
  });
};

/**
 * Calculates the minimum and maximum values (extents) for each series in the dataset.
 *
 * @param {DataKey[]} keys - The keys of the series to calculate extents for.
 * @param {ChartDataset} dataset - The dataset containing the series data.
 * @returns {SeriesExtents} Series extent by a series data key.
 */
export const getDatasetExtents = (
  keys: DataKey[],
  dataset: ChartDataset,
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

export const getCardColumnByDataKeyMap = (
  { card, data }: SingleSeries,
  columns: CartesianChartColumns,
): Record<DataKey, DatasetColumn> => {
  const breakoutValues =
    "breakout" in columns
      ? getBreakoutDistinctValues(data, columns.breakout.index)
      : null;

  return data.cols.reduce((acc, column) => {
    if (breakoutValues != null) {
      breakoutValues.forEach(breakoutValue => {
        acc[getDatasetKey(column, card.id, breakoutValue)] = column;
      });
    } else {
      acc[getDatasetKey(column, card.id)] = column;
    }
    return acc;
  }, {} as Record<DataKey, DatasetColumn>);
};

export const getCardsColumnByDataKeyMap = (
  rawSeries: RawSeries,
  cardsColumns: CartesianChartColumns[],
): Record<DataKey, DatasetColumn> => {
  return rawSeries.reduce((acc, cardSeries, index) => {
    const columns = cardsColumns[index];
    const cardColumnByDataKeyMap = getCardColumnByDataKeyMap(
      cardSeries,
      columns,
    );

    return { ...acc, ...cardColumnByDataKeyMap };
  }, {} as Record<DataKey, DatasetColumn>);
};

export const getBubbleSizeDomain = (
  seriesModels: SeriesModel[],
  dataset: ChartDataset,
): Extent | null => {
  const bubbleSizeDataKeys = seriesModels
    .map(seriesModel =>
      "bubbleSizeDataKey" in seriesModel &&
      seriesModel.bubbleSizeDataKey != null
        ? seriesModel.bubbleSizeDataKey
        : null,
    )
    .filter(isNotNull);

  if (bubbleSizeDataKeys.length === 0) {
    return null;
  }

  const bubbleSizeMaxValues = getObjectValues(
    getDatasetExtents(bubbleSizeDataKeys, dataset),
  ).map(extent => extent[1]);
  const bubbleSizeDomainMax = Math.max(...bubbleSizeMaxValues);

  return [0, bubbleSizeDomainMax];
};
