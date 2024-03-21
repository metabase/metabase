import dayjs from "dayjs";
import type {
  DatasetColumn,
  RawSeries,
  RowValue,
  SingleSeries,
  XAxisScale,
} from "metabase-types/api";
import type {
  DataKey,
  Extent,
  ChartDataset,
  SeriesExtents,
  SeriesModel,
  Datum,
  XAxisModel,
  NumericAxisScaleTransforms,
} from "metabase/visualizations/echarts/cartesian/model/types";
import type { CartesianChartColumns } from "metabase/visualizations/lib/graph/columns";
import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
import { isEmpty } from "metabase/lib/validate";

import { getBreakoutDistinctValues } from "metabase/visualizations/echarts/cartesian/model/series";
import { getObjectKeys, getObjectValues } from "metabase/lib/objects";
import { checkNumber, isNotNull } from "metabase/lib/types";
import {
  ECHARTS_CATEGORY_AXIS_NULL_VALUE,
  NEGATIVE_STACK_TOTAL_DATA_KEY,
  ORIGINAL_INDEX_DATA_KEY,
  POSITIVE_STACK_TOTAL_DATA_KEY,
  X_AXIS_DATA_KEY,
} from "metabase/visualizations/echarts/cartesian/constants/dataset";
import { isMetric } from "metabase-lib/types/utils/isa";
import { isCategoryAxis, isNumericAxis } from "./guards";
import { signedSquareRoot } from "./transforms";

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
 * @param dimensionIndex — Index of the dimension column of a card
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
    const rowValue = row[columnIndex];
    const isDimensionColumn = columnIndex === dimensionIndex;

    const seriesKey =
      breakoutIndex == null
        ? getDatasetKey(column, cardId)
        : getDatasetKey(column, cardId, row[breakoutIndex]);

    // The dimension values should not be aggregated, only metrics
    if (isMetric(column) && !isDimensionColumn) {
      datum[seriesKey] = sumMetric(datum[seriesKey], rowValue);
    } else if (!(seriesKey in datum)) {
      datum[seriesKey] = rowValue;
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

  const groupedData = new Map<RowValue, Datum>();

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
        [X_AXIS_DATA_KEY]: dimensionValue,
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
  record: Datum,
  index: number,
  dataset: ChartDataset,
) => Datum;

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
  return dataset.map((datum, index) => {
    return effectiveTransforms.reduce(
      (transformedDatum, transform: TransformFn) => {
        return transform(transformedDatum, index, dataset);
      },
      datum,
    );
  });
};

const getNumberOrZero = (value: RowValue): number =>
  typeof value === "number" ? value : 0;

export const computeTotal = (datum: Datum, keys: DataKey[]): number =>
  keys.reduce((total, key) => total + getNumberOrZero(datum[key]), 0);

export const getNormalizedDatasetTransform = (
  seriesDataKeys: DataKey[],
): TransformFn => {
  return datum => {
    const total = computeTotal(datum, seriesDataKeys);

    // Copy the dimension value
    const normalizedDatum: Datum = {
      [X_AXIS_DATA_KEY]: datum[X_AXIS_DATA_KEY],
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
  const replaceNullsWithZeroDataKeys = seriesModels
    .filter(
      seriesModel =>
        settings.series(seriesModel.legacySeriesSettingsObjectKey)[
          "line.missing"
        ] === "zero",
    )
    .map(seriesModel => seriesModel.dataKey);

  return getKeyBasedDatasetTransform(
    replaceNullsWithZeroDataKeys,
    (value: RowValue) => {
      return value === null ? 0 : value;
    },
  );
};

const hasInterpolatedSeries = (
  seriesModels: SeriesModel[],
  settings: ComputedVisualizationSettings,
) => {
  return seriesModels.some(seriesModel => {
    return (
      settings.series(seriesModel.legacySeriesSettingsObjectKey)[
        "line.missing"
      ] !== "none"
    );
  });
};

/**
 * Returns datum transformation function for stacked areas series with "interpolate" missing values setting.
 * It replaces null values with 0 if at least one series has non-null value.
 */
const getStackedAreasInterpolateTransform = (
  seriesModels: SeriesModel[],
): TransformFn => {
  const seriesKeys = seriesModels.map(seriesModel => seriesModel.dataKey);

  return (datum: Datum) => {
    const hasAtLeastOneSeriesValue = seriesKeys.some(key => datum[key] != null);
    if (!hasAtLeastOneSeriesValue) {
      return datum;
    }

    const transformedDatum = { ...datum };
    for (const seriesModel of seriesModels) {
      const dataKey = seriesModel.dataKey;
      transformedDatum[dataKey] = datum[dataKey] == null ? 0 : datum[dataKey];
    }
    return transformedDatum;
  };
};

function getStackedPowerTransform(seriesDataKeys: DataKey[]): TransformFn {
  return (datum: Datum) => {
    const transformedSeriesValues: Record<DataKey, number> = {};

    function getStackedTransformedValue(
      seriesDataKey: DataKey,
      sign: "+" | "-",
    ) {
      // 1. Get the untransformed total of the already stacked values and the
      //    value we are currently stacking
      const belowSeriesKeys = Object.keys(transformedSeriesValues);
      const rawBelowTotal = belowSeriesKeys
        .map(belowSeriesKey => datum[belowSeriesKey])
        .reduce((total: number, rowValue) => {
          const value = getNumberOrZero(rowValue);

          if (sign === "+" && value >= 0) {
            return total + value;
          }
          if (sign === "-" && value < 0) {
            return total + value;
          }
          return total;
        }, 0);
      const rawTotal = rawBelowTotal + getNumberOrZero(datum[seriesDataKey]);

      // 2. Transform this total
      const transformedTotal = signedSquareRoot(rawTotal);

      // 3. Subtract the transformed total of the already stacked values (not
      //    including the value we are currently stacking)
      transformedSeriesValues[seriesDataKey] =
        transformedTotal - signedSquareRoot(rawBelowTotal);
    }

    seriesDataKeys.forEach(seriesDataKey => {
      getStackedTransformedValue(
        seriesDataKey,
        getNumberOrZero(datum[seriesDataKey]) >= 0 ? "+" : "-",
      );
    });

    return { ...datum, ...transformedSeriesValues };
  };
}

function filterNullDimensionValues(dataset: ChartDataset) {
  // TODO show warning message
  const filteredDataset: ChartDataset = [];

  dataset.forEach((datum, originalIndex) => {
    if (datum[X_AXIS_DATA_KEY] == null) {
      return;
    }
    filteredDataset.push({
      ...datum,
      [ORIGINAL_INDEX_DATA_KEY]: originalIndex,
    });
  });

  return filteredDataset;
}

function getHistogramDataset(
  dataset: ChartDataset,
  histogramInterval: number | undefined,
) {
  const interval = histogramInterval ?? 1;

  dataset.unshift({
    [X_AXIS_DATA_KEY]: checkNumber(dataset[0][X_AXIS_DATA_KEY]) - interval,
  });
  dataset.push({
    [X_AXIS_DATA_KEY]:
      checkNumber(dataset[dataset.length - 1][X_AXIS_DATA_KEY]) + interval,
  });

  return dataset;
}

/**
 * Modifies the dataset for visualization according to the specified visualization settings.
 *
 * @param {ChartDataset} dataset The dataset to be transformed.
 * @param {SeriesModel[]} seriesModels Array of series models.
 * @param {ComputedVisualizationSettings} settings Computed visualization settings.
 * @returns {ChartDataset} A transformed dataset.
 */
export const applyVisualizationSettingsDataTransformations = (
  dataset: ChartDataset,
  xAxisModel: XAxisModel,
  seriesModels: SeriesModel[],
  yAxisScaleTransforms: NumericAxisScaleTransforms,
  settings: ComputedVisualizationSettings,
) => {
  if (
    xAxisModel.axisType === "value" ||
    xAxisModel.axisType === "time" ||
    xAxisModel.isHistogram
  ) {
    dataset = filterNullDimensionValues(dataset);
  }

  if (xAxisModel.axisType === "category" && xAxisModel.isHistogram) {
    dataset = getHistogramDataset(dataset, xAxisModel.histogramInterval);
  }

  const seriesDataKeys = seriesModels.map(seriesModel => seriesModel.dataKey);

  return transformDataset(dataset, [
    getNullReplacerTransform(settings, seriesModels),
    {
      condition: settings["stackable.stack_type"] === "normalized",
      fn: getNormalizedDatasetTransform(seriesDataKeys),
    },
    getKeyBasedDatasetTransform(seriesDataKeys, value =>
      yAxisScaleTransforms.toEChartsAxisValue(value),
    ),
    {
      condition:
        settings["graph.y_axis.scale"] === "pow" &&
        settings["stackable.stack_type"] != null,
      fn: getStackedPowerTransform(seriesDataKeys),
    },
    {
      condition: isCategoryAxis(xAxisModel),
      fn: getKeyBasedDatasetTransform([X_AXIS_DATA_KEY], value => {
        return isCategoryAxis(xAxisModel) && value == null
          ? ECHARTS_CATEGORY_AXIS_NULL_VALUE
          : value;
      }),
    },
    {
      condition: isNumericAxis(xAxisModel),
      fn: getKeyBasedDatasetTransform([X_AXIS_DATA_KEY], value => {
        return isNumericAxis(xAxisModel)
          ? xAxisModel.toEChartsAxisValue(value)
          : value;
      }),
    },
    {
      condition: settings["stackable.stack_type"] === "stacked",
      fn: datum => {
        return {
          ...datum,
          [POSITIVE_STACK_TOTAL_DATA_KEY]: Number.MIN_VALUE,
          [NEGATIVE_STACK_TOTAL_DATA_KEY]: -Number.MIN_VALUE,
        };
      },
    },
    {
      condition:
        settings["stackable.stack_type"] != null &&
        settings["stackable.stack_display"] === "area" &&
        hasInterpolatedSeries(seriesModels, settings),
      fn: getStackedAreasInterpolateTransform(seriesModels),
    },
  ]);
};

export const sortDataset = (
  dataset: ChartDataset,
  xAxisScale?: XAxisScale,
): ChartDataset => {
  if (xAxisScale === "timeseries") {
    return sortByDimension(dataset, (left, right) => {
      if (typeof left === "string" && typeof right === "string") {
        return dayjs(left).valueOf() - dayjs(right).valueOf();
      }
      return 0;
    });
  }

  if (xAxisScale !== "ordinal") {
    return sortByDimension(dataset, (left, right) => {
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
 * @param compareFn Sort compare function.
 * @returns A sorted dataset.
 */
const sortByDimension = (
  dataset: ChartDataset,
  compareFn: (a: RowValue, b: RowValue) => number,
): ChartDataset => {
  return dataset.sort((left, right) => {
    return compareFn(left[X_AXIS_DATA_KEY], right[X_AXIS_DATA_KEY]);
  });
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
  // order in the sidebar matches series order on the chart.
  // Also it produces historically correct order of series on already saved questions.
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
 * @param {ChartDataset} dataset - The original dataset.
 * @param {ReplacerFn} replacer - The function that will be used to replace values.
 * @returns {ChartDataset} A new dataset with the replaced values.
 */
export const replaceValues = (
  dataset: ChartDataset,
  replacer: ReplacerFn,
): ChartDataset => {
  return dataset.map(datum => {
    return getObjectKeys(datum).reduce((updatedRow, dataKey) => {
      updatedRow[dataKey] = replacer(dataKey, datum[dataKey]);
      return updatedRow;
    }, {} as Datum);
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
  return keys.reduce((acc, key) => {
    const extent = getSeriesExtent(dataset, key);
    if (extent != null) {
      acc[key] = extent;
    }
    return acc;
  }, {} as SeriesExtents);
};

export const getSeriesExtent = (dataset: ChartDataset, key: DataKey) => {
  let extent: Extent | null = null;

  dataset.forEach(datum => {
    const value = datum[key];

    if (typeof value !== "number" || !Number.isFinite(value)) {
      return;
    }

    if (extent == null) {
      extent = [value, value];
    }

    if (value < extent[0]) {
      extent[0] = value;
    }

    if (value > extent[1]) {
      extent[1] = value;
    }
  });

  return extent;
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
