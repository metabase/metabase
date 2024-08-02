import { t } from "ttag";

import { getObjectKeys } from "metabase/lib/objects";
import { parseTimestamp } from "metabase/lib/time-dayjs";
import { checkNumber, isNotNull } from "metabase/lib/types";
import { isEmpty } from "metabase/lib/validate";
import {
  ECHARTS_CATEGORY_AXIS_NULL_VALUE,
  NEGATIVE_STACK_TOTAL_DATA_KEY,
  ORIGINAL_INDEX_DATA_KEY,
  POSITIVE_STACK_TOTAL_DATA_KEY,
  X_AXIS_DATA_KEY,
} from "metabase/visualizations/echarts/cartesian/constants/dataset";
import { getBreakoutDistinctValues } from "metabase/visualizations/echarts/cartesian/model/series";
import type {
  DataKey,
  Extent,
  ChartDataset,
  SeriesExtents,
  SeriesModel,
  Datum,
  XAxisModel,
  NumericAxisScaleTransforms,
  TimeSeriesXAxisModel,
  StackModel,
} from "metabase/visualizations/echarts/cartesian/model/types";
import { sumMetric } from "metabase/visualizations/lib/dataset";
import type { CartesianChartColumns } from "metabase/visualizations/lib/graph/columns";
import { getNumberOr } from "metabase/visualizations/lib/settings/row-values";
import {
  invalidDateWarning,
  nullDimensionWarning,
  unaggregatedDataWarning,
} from "metabase/visualizations/lib/warnings";
import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
import { isMetric } from "metabase-lib/v1/types/utils/isa";
import type {
  DatasetColumn,
  RawSeries,
  RowValue,
  SingleSeries,
  XAxisScale,
} from "metabase-types/api";

import type { ShowWarning } from "../../types";
import { tryGetDate } from "../utils/timeseries";

import { isCategoryAxis, isNumericAxis, isTimeSeriesAxis } from "./guards";
import { getBarSeriesDataLabelKey, getColumnScaling } from "./util";

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

interface DatasetColumnInfo {
  column: DatasetColumn;
  isMetric: boolean;
}

/**
 * Aggregates metric column values in a datum for a given row.
 * When a breakoutIndex is specified it aggregates metrics per breakout value.
 *
 * @param {Record<DataKey, RowValue>} datum - The datum object to aggregate metric values.
 * @param {DatasetColumn[]} columns - The columns of the raw dataset.
 * @param {RowValue[]} row - The raw row of values.
 * @param {number} cardId - The ID of the card.
 * @param {number} dimensionIndex — Index of the dimension column of a card
 * @param {number | undefined} breakoutIndex - The breakout column index for charts with two dimension columns selected.
 */
const aggregateColumnValuesForDatum = (
  datum: Record<DataKey, RowValue>,
  columns: DatasetColumnInfo[],
  row: RowValue[],
  cardId: number,
  dimensionIndex: number,
  breakoutIndex: number | undefined,
  showWarning?: ShowWarning,
): void => {
  columns.forEach(({ column, isMetric }, columnIndex) => {
    const rowValue = row[columnIndex];
    const isDimensionColumn = columnIndex === dimensionIndex;

    const seriesKey =
      breakoutIndex == null
        ? getDatasetKey(column, cardId)
        : getDatasetKey(column, cardId, row[breakoutIndex]);

    // The dimension values should not be aggregated, only metrics
    if (isMetric && !isDimensionColumn) {
      if (seriesKey in datum) {
        showWarning?.(
          unaggregatedDataWarning(columns[dimensionIndex].column).text,
        );
      }

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
  showWarning?: ShowWarning,
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
    const datasetColumns = cols.map(column => ({
      column,
      isMetric: isMetric(column),
    }));
    const chartColumns = cardsColumns[index];

    const dimensionIndex = chartColumns.dimension.index;
    const breakoutIndex =
      "breakout" in chartColumns ? chartColumns.breakout.index : undefined;

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
        datasetColumns,
        row,
        card.id,
        dimensionIndex,
        breakoutIndex,
        showWarning,
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
  stackModels: StackModel[],
): TransformFn => {
  return datum => {
    const normalizedDatum = {
      ...datum,
    };

    stackModels.forEach(stackModel => {
      const total = computeTotal(datum, stackModel.seriesKeys);

      // Compute normalized values for metrics
      return stackModel.seriesKeys.reduce((acc, key) => {
        const numericValue = getNumberOrZero(datum[key]);
        acc[key] = numericValue / total;
        return acc;
      }, normalizedDatum);
    });

    return normalizedDatum;
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

  return datum => {
    const transformedDatum = { ...datum };
    for (const key of replaceNullsWithZeroDataKeys) {
      transformedDatum[key] = datum[key] != null ? datum[key] : 0;
    }
    return transformedDatum;
  };
};

const hasInterpolatedAreaSeries = (
  seriesModels: SeriesModel[],
  settings: ComputedVisualizationSettings,
) => {
  return seriesModels.some(seriesModel => {
    const seriesSettings = settings.series(
      seriesModel.legacySeriesSettingsObjectKey,
    );
    return (
      seriesSettings["line.missing"] !== "none" &&
      seriesSettings.display === "area"
    );
  });
};

/**
 * Returns datum transformation function for stacked areas series with "interpolate" missing values setting.
 * It replaces null values with 0 if at least one series has non-null value.
 */
const getStackedAreasInterpolateTransform = (
  seriesModels: SeriesModel[],
  areaStackSeriesKeys: DataKey[],
): TransformFn => {
  const areaStackSeriesKeysSet = new Set(areaStackSeriesKeys);
  return (datum: Datum) => {
    const hasAtLeastOneSeriesValue = areaStackSeriesKeys.some(
      key => datum[key] != null,
    );
    if (!hasAtLeastOneSeriesValue) {
      return datum;
    }

    const transformedDatum = { ...datum };
    for (const seriesModel of seriesModels) {
      const dataKey = seriesModel.dataKey;
      if (areaStackSeriesKeysSet.has(dataKey)) {
        transformedDatum[dataKey] = datum[dataKey] == null ? 0 : datum[dataKey];
      }
    }
    return transformedDatum;
  };
};

function getStackedValueTransformFunction(
  seriesDataKeys: DataKey[],
  valueTransform: (value: number) => number | null,
): TransformFn {
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
          if (typeof rowValue !== "number") {
            return total;
          }

          if (sign === "+" && rowValue >= 0) {
            return total + rowValue;
          }
          if (sign === "-" && rowValue < 0) {
            return total + rowValue;
          }
          return total;
        }, 0);
      const rawTotal = rawBelowTotal + getNumberOrZero(datum[seriesDataKey]);

      // 2. Transform this total
      const transformedTotal = valueTransform(rawTotal) ?? 0;

      // 3. Subtract the transformed total of the already stacked values (not
      //    including the value we are currently stacking)
      const transformedRawBelowTotal = valueTransform(rawBelowTotal) ?? 0;

      transformedSeriesValues[seriesDataKey] =
        transformedTotal - transformedRawBelowTotal;
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

function getStackedValueTransform(
  settings: ComputedVisualizationSettings,
  yAxisScaleTransforms: NumericAxisScaleTransforms,
  stackModels: StackModel[],
): ConditionalTransform[] {
  const isPow = settings["graph.y_axis.scale"] === "pow";
  const isLog = settings["graph.y_axis.scale"] === "log";

  const isNonLinearAxis = isPow || isLog;

  return stackModels.map(stackModel => ({
    condition: isNonLinearAxis,
    fn: getStackedValueTransformFunction(
      stackModel.seriesKeys,
      yAxisScaleTransforms.toEChartsAxisValue,
    ),
  }));
}

function getStackedDataLabelTransform(
  settings: ComputedVisualizationSettings,
  seriesDataKeys: DataKey[],
): ConditionalTransform {
  return {
    condition: settings["stackable.stack_type"] === "stacked",
    fn: (datum: Datum) => {
      const transformedDatum = { ...datum };

      seriesDataKeys.forEach(seriesDataKey => {
        const value = datum[seriesDataKey];
        if (typeof value !== "number") {
          return;
        }

        if (value >= 0) {
          transformedDatum[POSITIVE_STACK_TOTAL_DATA_KEY] = Number.MIN_VALUE;
        }
        if (value < 0) {
          transformedDatum[NEGATIVE_STACK_TOTAL_DATA_KEY] = -Number.MIN_VALUE;
        }
      });

      return transformedDatum;
    },
  };
}

function getBarSeriesDataLabelTransform(
  barSeriesModels: SeriesModel[],
): ConditionalTransform {
  return {
    condition: barSeriesModels.length > 0,
    fn: (datum: Datum) => {
      const transforedDatum = { ...datum };

      barSeriesModels.forEach(({ dataKey }) => {
        const value = datum[dataKey];
        if (typeof value !== "number") {
          return;
        }
        if (value >= 0) {
          transforedDatum[getBarSeriesDataLabelKey(dataKey, "+")] =
            Number.MIN_VALUE;
        }
        if (value < 0) {
          transforedDatum[getBarSeriesDataLabelKey(dataKey, "-")] =
            -Number.MIN_VALUE;
        }
      });

      return transforedDatum;
    },
  };
}

/**
 * Replaces zero values with nulls for bar series so that we can use minHeight ECharts option
 * to set minimum bar height for all non-zero values because it applies to bars with zero values too.
 */
function getBarSeriesZeroToNullTransform(
  barSeriesModels: SeriesModel[],
): ConditionalTransform {
  return {
    condition: barSeriesModels.length > 0,
    fn: (datum: Datum) => {
      const transforedDatum = { ...datum };

      barSeriesModels.forEach(({ dataKey }) => {
        transforedDatum[dataKey] = datum[dataKey] === 0 ? null : datum[dataKey];
      });

      return transforedDatum;
    },
  };
}

export function filterNullDimensionValues(
  dataset: ChartDataset,
  showWarning?: ShowWarning,
) {
  const filteredDataset: ChartDataset = [];

  dataset.forEach((datum, originalIndex) => {
    if (datum[X_AXIS_DATA_KEY] == null) {
      showWarning?.(nullDimensionWarning().text);
      return;
    }
    filteredDataset.push({
      ...datum,
      [ORIGINAL_INDEX_DATA_KEY]: originalIndex,
    });
  });

  return filteredDataset;
}

const Y_AXIS_CROSSING_ERROR = Error(
  t`Y-axis must not cross 0 when using log scale.`,
);

export const NO_X_AXIS_VALUES_ERROR_MESSAGE = t`There is no data to display. Check the query to ensure there are non-null x-axis values.`;

export function replaceZeroesForLogScale(
  dataset: ChartDataset,
  seriesDataKeys: DataKey[],
) {
  let hasZeros = false;
  let minNonZeroValue = Infinity;
  let sign: number | undefined = undefined;

  dataset.forEach(datum => {
    const datumNumericValues = seriesDataKeys
      .map(key => getNumberOr(datum[key], null))
      .filter(isNotNull);

    const hasPositive = datumNumericValues.some(value => value > 0);
    const hasNegative = datumNumericValues.some(value => value < 0);

    if (hasPositive && hasNegative) {
      throw Y_AXIS_CROSSING_ERROR;
    }

    if (sign === undefined && hasPositive) {
      sign = 1;
    }
    if (sign === undefined && hasNegative) {
      sign = -1;
    }
    if ((sign === 1 && hasNegative) || (sign === -1 && hasPositive)) {
      throw Y_AXIS_CROSSING_ERROR;
    }

    if (!hasZeros) {
      hasZeros = datumNumericValues.includes(0);
    }

    minNonZeroValue = Math.min(
      minNonZeroValue,
      ...datumNumericValues
        .map(value => Math.abs(value))
        .filter(number => number !== 0),
    );
  });

  // if sign is still undefined all metric series values are 0
  if (!hasZeros || sign === undefined) {
    return dataset;
  }

  const zeroReplacementValue = sign * Math.min(minNonZeroValue, 1);

  return replaceValues(dataset, (dataKey: DataKey, value: RowValue) =>
    seriesDataKeys.includes(dataKey) && value === 0
      ? zeroReplacementValue
      : value,
  );
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

const MAX_FILL_COUNT = 10000;

const interpolateTimeSeriesData = (
  dataset: ChartDataset,
  axisModel: TimeSeriesXAxisModel,
): ChartDataset => {
  if (axisModel.intervalsCount > MAX_FILL_COUNT) {
    return dataset;
  }

  const { count, unit } = axisModel.interval;
  const result = [];

  for (let i = 0; i < dataset.length; i++) {
    const datum = dataset[i];
    result.push({
      ...datum,
      [ORIGINAL_INDEX_DATA_KEY]: datum[ORIGINAL_INDEX_DATA_KEY] ?? i,
    });

    if (i === dataset.length - 1) {
      break;
    }

    const end = parseTimestamp(dataset[i + 1][X_AXIS_DATA_KEY]);

    let start = parseTimestamp(datum[X_AXIS_DATA_KEY]);
    while (start.add(count, unit).isBefore(end, unit)) {
      const interpolatedValue = start.add(count, unit);
      result.push({
        [X_AXIS_DATA_KEY]: interpolatedValue.toISOString(),
      });

      start = interpolatedValue;
    }
  }

  return result;
};

export function scaleDataset(
  dataset: ChartDataset,
  seriesModels: SeriesModel[],
  settings: ComputedVisualizationSettings,
): ChartDataset {
  const scalingByDataKey: Record<DataKey, number> = {};
  for (const seriesModel of seriesModels) {
    scalingByDataKey[seriesModel.dataKey] = getColumnScaling(
      seriesModel.column,
      settings,
    );
  }

  const transformFn = (datum: Datum) => {
    const transformedRecord = { ...datum };
    for (const seriesModel of seriesModels) {
      const scale = scalingByDataKey[seriesModel.dataKey];

      const key = seriesModel.dataKey;
      if (key in datum) {
        const scaledValue = Number.isFinite(datum[key])
          ? (datum[key] as number) * scale
          : null;
        transformedRecord[key] = scaledValue;
      }
    }
    return transformedRecord;
  };

  return dataset.map(datum => {
    return transformFn(datum);
  });
}

const getYAxisScaleTransforms = (
  seriesModels: SeriesModel[],
  stackModels: StackModel[],
  yAxisScaleTransforms: NumericAxisScaleTransforms,
  settings: ComputedVisualizationSettings,
) => {
  const stackedSeriesKeys = new Set(
    stackModels.flatMap(stackModel => stackModel.seriesKeys),
  );
  const nonStackedSeriesKeys = seriesModels
    .filter(seriesModel => !stackedSeriesKeys.has(seriesModel.dataKey))
    .map(seriesModel => seriesModel.dataKey);

  const nonStackedTransform = getKeyBasedDatasetTransform(
    nonStackedSeriesKeys,
    value => yAxisScaleTransforms.toEChartsAxisValue(value),
  );
  const stackedTransforms = getStackedValueTransform(
    settings,
    yAxisScaleTransforms,
    stackModels,
  );

  return [nonStackedTransform, ...stackedTransforms];
};

/**
 * Modifies the dataset for visualization according to the specified visualization settings.
 *
 * @param {ChartDataset} dataset The dataset to be transformed.
 * @param {SeriesModel[]} seriesModels Array of series models.
 * @param {ComputedVisualizationSettings} settings Computed visualization settings.
 * @param {ShowWarning | undefined} showWarning Displays a warning icon and message in the query builder.
 *
 * @returns {ChartDataset} A transformed dataset.
 */
export const applyVisualizationSettingsDataTransformations = (
  dataset: ChartDataset,
  stackModels: StackModel[],
  xAxisModel: XAxisModel,
  seriesModels: SeriesModel[],
  yAxisScaleTransforms: NumericAxisScaleTransforms,
  settings: ComputedVisualizationSettings,
  showWarning?: ShowWarning,
) => {
  const barSeriesModels = seriesModels.filter(seriesModel => {
    const seriesSettings = settings.series(
      seriesModel.legacySeriesSettingsObjectKey,
    );
    return seriesSettings.display === "bar";
  });
  const seriesDataKeys = seriesModels.map(seriesModel => seriesModel.dataKey);

  if (
    isNumericAxis(xAxisModel) ||
    isTimeSeriesAxis(xAxisModel) ||
    xAxisModel.isHistogram
  ) {
    dataset = filterNullDimensionValues(dataset, showWarning);
    if (dataset.length === 0) {
      throw new Error(NO_X_AXIS_VALUES_ERROR_MESSAGE);
    }
  }

  if (settings["graph.y_axis.scale"] === "log") {
    dataset = replaceZeroesForLogScale(dataset, seriesDataKeys);
  }

  if (isCategoryAxis(xAxisModel) && xAxisModel.isHistogram) {
    dataset = getHistogramDataset(dataset, xAxisModel.histogramInterval);
  }

  if (isTimeSeriesAxis(xAxisModel)) {
    dataset = interpolateTimeSeriesData(dataset, xAxisModel);
  }

  return transformDataset(dataset, [
    getNullReplacerTransform(settings, seriesModels),
    {
      condition: settings["stackable.stack_type"] === "normalized",
      fn: getNormalizedDatasetTransform(stackModels),
    },
    ...getYAxisScaleTransforms(
      seriesModels,
      stackModels,
      yAxisScaleTransforms,
      settings,
    ),
    {
      condition: isCategoryAxis(xAxisModel),
      fn: getKeyBasedDatasetTransform([X_AXIS_DATA_KEY], value => {
        return isCategoryAxis(xAxisModel) && value == null
          ? ECHARTS_CATEGORY_AXIS_NULL_VALUE
          : value;
      }),
    },
    {
      condition: isNumericAxis(xAxisModel) || isTimeSeriesAxis(xAxisModel),
      fn: getKeyBasedDatasetTransform([X_AXIS_DATA_KEY], value => {
        return isNumericAxis(xAxisModel) || isTimeSeriesAxis(xAxisModel)
          ? xAxisModel.toEChartsAxisValue(value)
          : value;
      }),
    },
    getStackedDataLabelTransform(settings, seriesDataKeys),
    getBarSeriesDataLabelTransform(barSeriesModels),
    {
      condition:
        settings["stackable.stack_type"] != null &&
        hasInterpolatedAreaSeries(seriesModels, settings),
      fn: getStackedAreasInterpolateTransform(
        seriesModels,
        stackModels.find(stackModel => stackModel.display === "area")
          ?.seriesKeys ?? [],
      ),
    },
    getBarSeriesZeroToNullTransform(barSeriesModels),
  ]);
};

export const sortDataset = (
  dataset: ChartDataset,
  xAxisScale: XAxisScale | undefined,
  showWarning?: ShowWarning,
): ChartDataset => {
  if (xAxisScale === "ordinal") {
    return dataset;
  }

  if (xAxisScale === "timeseries") {
    return sortByDimension(dataset, (left, right) => {
      const leftDate = tryGetDate(left);
      const rightDate = tryGetDate(right);

      if (leftDate == null || rightDate == null) {
        showWarning?.(invalidDateWarning(leftDate == null ? left : right).text);
        return 0;
      }

      return leftDate.valueOf() - rightDate.valueOf();
    });
  }

  return sortByDimension(dataset, (left, right) => {
    if (typeof left === "number" && typeof right === "number") {
      return left - right;
    }
    return 0;
  });
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

  // TODO: series created from breakout values null and an empty string have the same
  // name and vizSettingsKey so we should not match the series order item with the same series models.
  // Overall, this is bad to not having a name and key distinction between breakout series with such values and we should fix this.
  const usedDataKeys = new Set();
  const orderedSeriesModels = breakoutSeriesOrder
    .filter(orderSetting => orderSetting.enabled)
    .map(orderSetting => {
      const foundSeries = seriesModels.find(
        seriesModel =>
          seriesModel.vizSettingsKey === orderSetting.key &&
          !usedDataKeys.has(seriesModel.dataKey),
      );
      if (foundSeries === undefined) {
        throw new TypeError("Series not found");
      }

      usedDataKeys.add(foundSeries.dataKey);
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
