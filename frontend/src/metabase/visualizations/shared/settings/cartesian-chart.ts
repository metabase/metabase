import { t } from "ttag";
import _ from "underscore";

import { isNotNull } from "metabase/lib/types";
import {
  getMaxDimensionsSupported,
  getMaxMetricsSupported,
} from "metabase/visualizations";
import { getCardsColumns } from "metabase/visualizations/echarts/cartesian/model";
import { getCardsSeriesModels } from "metabase/visualizations/echarts/cartesian/model/series";
import { dimensionIsNumeric } from "metabase/visualizations/lib/numeric";
import { dimensionIsTimeseries } from "metabase/visualizations/lib/timeseries";
import {
  MAX_SERIES,
  columnsAreValid,
  getColumnCardinality,
  getDefaultDimensionsAndMetrics,
  preserveExistingColumnsOrder,
} from "metabase/visualizations/lib/utils";
import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
import { getColumnKey } from "metabase-lib/v1/queries/utils/column-key";
import {
  isAny,
  isDate,
  isDimension,
  isMetric,
  isNumeric,
} from "metabase-lib/v1/types/utils/isa";
import type {
  Card,
  DatasetColumn,
  DatasetData,
  RawSeries,
  SeriesOrderSetting,
} from "metabase-types/api";

export function getDefaultDimensionFilter(display: string) {
  return display === "scatter" ? isAny : isDimension;
}

export function getDefaultMetricFilter(display: string) {
  return display === "scatter" ? isNumeric : isMetric;
}

export function getAreDimensionsAndMetricsValid(rawSeries: RawSeries) {
  return rawSeries.some(({ card, data }) => {
    const dimensions = card.visualization_settings["graph.dimensions"];
    const metrics = card.visualization_settings["graph.metrics"];

    const dimensionsFilter = getDefaultDimensionFilter(card.display);
    const metricsFilter = getDefaultMetricFilter(card.display);

    return (
      columnsAreValid(dimensions, data, dimensionsFilter) &&
      columnsAreValid(metrics, data, metricsFilter) &&
      (metrics ?? []).length <= getMaxMetricsSupported(card.display)
    );
  });
}

export function getDefaultDimensions(
  rawSeries: RawSeries,
  settings: ComputedVisualizationSettings,
) {
  const [{ card, data }] = rawSeries;
  const mainSeriesColumns = data?.cols ?? [];
  const hasData = mainSeriesColumns.length > 0;
  const prevDimensionsRaw = (settings["graph.dimensions"] ?? []).filter(
    isNotNull,
  );
  const prevDimensions = hasData
    ? prevDimensionsRaw.filter((columnName: string) =>
        mainSeriesColumns.some((col: DatasetColumn) => col.name === columnName),
      )
    : prevDimensionsRaw;
  const defaultDimensions = getDefaultColumns(rawSeries).dimensions;
  const canReusePrevious =
    prevDimensions.length > 0 &&
    defaultDimensions.length > 0 &&
    defaultDimensions[0] == null &&
    (!hasData ||
      (columnsAreValid(
        prevDimensionsRaw,
        data,
        getDefaultDimensionFilter(card.display),
      ) &&
        prevDimensionsRaw.filter((colName) => colName !== null).length ===
          prevDimensionsRaw.length));

  if (canReusePrevious) {
    return prevDimensions;
  }

  return preserveExistingColumnsOrder(prevDimensions, defaultDimensions);
}

export function getDefaultMetrics(
  rawSeries: RawSeries,
  settings: ComputedVisualizationSettings,
) {
  const [{ card, data }] = rawSeries;
  const hasData = (data?.cols ?? []).length > 0;
  const prevMetrics = settings["graph.metrics"] ?? [];
  const defaultMetrics = getDefaultColumns(rawSeries).metrics;
  const canReusePrevious =
    prevMetrics.length > 0 &&
    defaultMetrics.length > 0 &&
    defaultMetrics[0] == null &&
    (!hasData ||
      (columnsAreValid(
        prevMetrics,
        data,
        getDefaultMetricFilter(card.display),
      ) &&
        prevMetrics.filter((metric) => metric !== null).length ===
          prevMetrics.length));

  if (canReusePrevious) {
    return prevMetrics;
  }
  return defaultMetrics.slice(0, getMaxMetricsSupported(card.display));
}

export const STACKABLE_SERIES_DISPLAY_TYPES = new Set(["area", "bar"]);

export const isStackingValueValid = (
  settings: ComputedVisualizationSettings,
  seriesDisplays: string[],
) => {
  if (settings["stackable.stack_type"] == null) {
    return true;
  }

  const stackableDisplays = seriesDisplays.filter((display) =>
    STACKABLE_SERIES_DISPLAY_TYPES.has(display),
  );
  return stackableDisplays.length > 1;
};

export const isShowStackValuesValid = (
  seriesDisplays: string[],
  settings: ComputedVisualizationSettings,
) => {
  const areAllAreas = seriesDisplays.every((display) => display === "area");

  return !areAllAreas && settings["stackable.stack_type"] !== "normalized";
};

export const getDefaultShowStackValues = (
  settings: ComputedVisualizationSettings,
) => (settings["stackable.stack_type"] === "normalized" ? "series" : "total");

export const getDefaultStackingValue = (
  settings: ComputedVisualizationSettings,
  card: Card,
) => {
  // legacy setting and default for D-M-M+ charts
  if (settings["stackable.stacked"]) {
    return settings["stackable.stacked"];
  }

  const shouldStack =
    card.display === "area" &&
    ((settings["graph.metrics"] ?? []).length > 1 ||
      (settings["graph.dimensions"] ?? []).length > 1);

  return shouldStack ? "stacked" : null;
};

export const getSeriesOrderDimensionSetting = (
  settings: ComputedVisualizationSettings,
) => settings["graph.dimensions"]?.[1];

export const getSeriesOrderVisibilitySettings = (
  settings: ComputedVisualizationSettings,
  seriesKeys: string[],
) => {
  const seriesSettings = settings["series_settings"];
  const seriesColors = settings["series_settings.colors"] || {};
  const seriesOrder = settings["graph.series_order"];
  // Because this setting is a read dependency of graph.series_order_dimension, this should
  // Always be the stored setting, not calculated.
  const seriesOrderDimension = settings["graph.series_order_dimension"];
  const currentDimension = settings["graph.dimensions"]?.[1];

  if (currentDimension === undefined) {
    return [];
  }

  const generateDefault = (keys: string[]) => {
    return keys.map((key) => ({
      key,
      color: seriesColors[key],
      enabled: true,
      name: seriesSettings?.[key]?.title || key,
    }));
  };

  const removeMissingOrder = (keys: string[], order: SeriesOrderSetting[]) =>
    order.filter((o) => keys.includes(o.key));
  const newKeys = (keys: string[], order: SeriesOrderSetting[]) =>
    keys.filter((key) => !order.find((o) => o.key === key));

  if (
    !seriesOrder ||
    !_.isArray(seriesOrder) ||
    !seriesOrder.every(
      (order) =>
        order.key !== undefined &&
        order.name !== undefined &&
        order.color !== undefined,
    ) ||
    seriesOrderDimension !== currentDimension
  ) {
    return generateDefault(seriesKeys);
  }

  return [
    ...removeMissingOrder(seriesKeys, seriesOrder),
    ...generateDefault(newKeys(seriesKeys, seriesOrder)),
  ].map((item) => ({
    ...item,
    name: seriesSettings?.[item.key]?.title || item.key,
    color: seriesColors[item.key],
  }));
};

export const getDefaultYAxisTitle = (metricNames: string[]) => {
  const metricsCount = new Set(metricNames).size;
  return metricsCount === 1 ? metricNames[0] : null;
};

export const getIsYAxisLabelEnabledDefault = () => true;

export const getYAxisAutoRangeDefault = () => true;

export const getYAxisUnpinFromZeroDefault = (display: string) =>
  display === "scatter";

export const isYAxisUnpinFromZeroValid = (
  seriesDisplays: string[],
  settings: ComputedVisualizationSettings,
) => {
  if (
    !settings["graph.y_axis.auto_range"] ||
    settings["stackable.stack_type"] != null
  ) {
    return false;
  }

  return seriesDisplays.every(
    (display) =>
      display !== "area" && display !== "bar" && display !== "waterfall",
  );
};

export const getDefaultXAxisTitle = (
  dimensionColumn: DatasetColumn | undefined,
) => {
  if (!dimensionColumn) {
    return null;
  }

  return dimensionColumn.display_name;
};

export const getIsXAxisLabelEnabledDefault = () => true;

export const getDefaultIsHistogram = (dimensionColumn: DatasetColumn) => {
  return dimensionColumn.binning_info != null;
};

export const getDefaultIsAutoSplitEnabled = () => true;

export const getDefaultIsNumeric = (
  data: DatasetData,
  dimensionIndex: number,
) => {
  return dimensionIsNumeric(data, dimensionIndex);
};

export const getDefaultIsTimeSeries = (
  data: DatasetData,
  dimensionIndex: number,
) => {
  return dimensionIsTimeseries(data, dimensionIndex);
};

export const getDefaultXAxisScale = (
  vizSettings: ComputedVisualizationSettings,
  display?: string,
) => {
  if (display === "boxplot") {
    return "ordinal";
  }
  if (vizSettings["graph.x_axis._is_histogram"]) {
    return "histogram";
  }
  if (vizSettings["graph.x_axis._is_timeseries"]) {
    return "timeseries";
  }
  if (vizSettings["graph.x_axis._is_numeric"]) {
    return "linear";
  }
  return "ordinal";
};

export const getDefaultLegendIsReversed = (
  vizSettings: ComputedVisualizationSettings,
) => vizSettings["stackable.stack_type"] != null;

export const getDefaultShowDataLabels = () => false;
export const getDefaultDataLabelsFrequency = () => "fit";
export const getDefaultDataLabelsFormatting = () => "auto";

export const getAvailableXAxisScales = (
  [{ data, card }]: RawSeries,
  settings: ComputedVisualizationSettings,
) => {
  if (card.display === "boxplot") {
    return [{ name: t`Ordinal`, value: "ordinal" }];
  }

  const options = [];

  const dimensionColumn = data.cols.find(
    (col) => col != null && col.name === settings["graph.dimensions"]?.[0],
  );

  if (settings["graph.x_axis._is_timeseries"]) {
    options.push({ name: t`Timeseries`, value: "timeseries" });
  }

  if (settings["graph.x_axis._is_numeric"]) {
    options.push({ name: t`Linear`, value: "linear" });

    // For relative date units such as day of week we do not want to show log, pow, histogram scales
    if (!isDate(dimensionColumn)) {
      if (!settings["graph.x_axis._is_histogram"]) {
        options.push({ name: t`Power`, value: "pow" });
        options.push({ name: t`Log`, value: "log" });
      }
      options.push({ name: t`Histogram`, value: "histogram" });
    }
  }

  options.push({ name: t`Ordinal`, value: "ordinal" });

  return options;
};

const WATERFALL_UNSUPPORTED_X_AXIS_SCALES = ["pow", "log"];
export const isXAxisScaleValid = (
  series: RawSeries,
  settings: ComputedVisualizationSettings,
) => {
  const isWaterfall = series[0].card.display === "waterfall";
  const xAxisScale = settings["graph.x_axis.scale"];
  const options = getAvailableXAxisScales(series, settings).map(
    (option) => option.value,
  );

  if (xAxisScale && !options.includes(xAxisScale)) {
    return false;
  }

  return (
    !isWaterfall ||
    (xAxisScale && !WATERFALL_UNSUPPORTED_X_AXIS_SCALES.includes(xAxisScale))
  );
};

export const getDefaultGoalLabel = () => t`Goal`;

/**
 * Returns the default column names to be used for scatter plot viz settings.
 *
 * @param data - property on the series object from the `rawSeries` array
 * @returns object containing column names
 */
export function getDefaultScatterColumns(data: DatasetData) {
  const { cols, rows } = data;
  const dimensions = cols.filter(isDimension);
  const metrics = cols.filter(isMetric);

  let colorDimension; // used for color
  let xAxisDimension; // only used when there's only one metric
  if (dimensions.length === 2) {
    const cardinality0 = getColumnCardinality(
      cols,
      rows,
      cols.indexOf(dimensions[0]),
    );
    const cardinality1 = getColumnCardinality(
      cols,
      rows,
      cols.indexOf(dimensions[1]),
    );
    if (cardinality0 <= cardinality1 && cardinality0 <= MAX_SERIES) {
      colorDimension = dimensions[0].name;
      xAxisDimension = dimensions[1].name;
    } else if (cardinality0 <= cardinality1) {
      xAxisDimension = dimensions[0].name;
    } else if (cardinality1 <= MAX_SERIES) {
      colorDimension = dimensions[1].name;
      xAxisDimension = dimensions[0].name;
    } else {
      xAxisDimension = dimensions[1].name;
    }
  } else if (dimensions.length === 1) {
    xAxisDimension = dimensions[0].name;
  }

  if (metrics.length === 3 || metrics.length === 2) {
    return {
      dimensions: colorDimension
        ? [metrics[0].name, colorDimension]
        : [metrics[0].name],
      metrics: [metrics[1].name],
      // we could use the third metric as the bubble, but it could break existing charts
      // since scatter.bubble doesn't have persistDefault set like graph.dimensions and graph.metrics
      bubble: null,
    };
  } else if (metrics.length === 1 && xAxisDimension) {
    return {
      dimensions: colorDimension
        ? [xAxisDimension, colorDimension]
        : [xAxisDimension],
      metrics: [metrics[0].name],
      bubble: null,
    };
  }
  return {
    dimensions: [null],
    metrics: [null],
    bubble: null,
  };
}

/**
 * Returns the default column name for the bubble size setting
 * on the scatter plot. If there is no suitable default, it will return `null`.
 *
 * @param data - property on the series object from the `rawSeries` array
 * @returns column name string or `null`
 */
export function getDefaultBubbleSizeCol(data: DatasetData) {
  return getDefaultScatterColumns(data).bubble;
}

export function getDefaultColumns(series: RawSeries) {
  if (series[0].card.display === "scatter") {
    return getDefaultScatterColumns(series[0].data);
  } else {
    return getDefaultLineAreaBarColumns(series);
  }
}

function getDefaultLineAreaBarColumns(series: RawSeries) {
  const [
    {
      card: { display },
    },
  ] = series;
  return getDefaultDimensionsAndMetrics(
    series,
    getMaxDimensionsSupported(display),
  );
}

export function getAvailableAdditionalColumns(
  rawSeries: RawSeries,
  settings: ComputedVisualizationSettings,
): DatasetColumn[] {
  const alreadyIncludedColumns = new Set<DatasetColumn>();

  if (
    _.isEmpty(settings["graph.dimensions"]?.filter(isNotNull)) ||
    _.isEmpty(settings["graph.metrics"]?.filter(isNotNull))
  ) {
    return [];
  }

  getCardsColumns(rawSeries, settings).forEach((cardColumns) => {
    alreadyIncludedColumns.add(cardColumns.dimension.column);
    if ("breakout" in cardColumns) {
      alreadyIncludedColumns.add(cardColumns.breakout.column);
      alreadyIncludedColumns.add(cardColumns.metric.column);
    } else {
      cardColumns.metrics.forEach((columnDescriptor) =>
        alreadyIncludedColumns.add(columnDescriptor.column),
      );
    }
  });

  return rawSeries
    .flatMap((singleSeries) => {
      return singleSeries.data.cols;
    })
    .filter((column) => !alreadyIncludedColumns.has(column));
}

export function getComputedAdditionalColumnsValue(
  rawSeries: RawSeries,
  settings: ComputedVisualizationSettings,
) {
  const isScatter = rawSeries[0].card.display === "scatter";

  const availableAdditionalColumnKeys = new Set(
    getAvailableAdditionalColumns(rawSeries, settings).map((column) =>
      getColumnKey(column),
    ),
  );

  if (!settings["graph.tooltip_columns"] && isScatter) {
    return Array.from(availableAdditionalColumnKeys);
  }

  const filteredStoredColumns = (
    settings["graph.tooltip_columns"] ?? []
  ).filter((columnKey: string) => availableAdditionalColumnKeys.has(columnKey));

  return filteredStoredColumns;
}

export function getSeriesModelsForSettings(
  rawSeries: RawSeries,
  settings: ComputedVisualizationSettings,
) {
  const cardsColumns = getCardsColumns(rawSeries, settings);
  return getCardsSeriesModels(rawSeries, cardsColumns, [], settings);
}
