import { t } from "ttag";
import _ from "underscore";

import { getMaxDimensionsSupported } from "metabase/visualizations";
import { dimensionIsNumeric } from "metabase/visualizations/lib/numeric";
import { dimensionIsTimeseries } from "metabase/visualizations/lib/timeseries";
import {
  columnsAreValid,
  getDefaultDimensionsAndMetrics,
  getFriendlyName,
  preserveExistingColumnsOrder,
} from "metabase/visualizations/lib/utils";
import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
import {
  isAny,
  isDate,
  isDimension,
  isMetric,
  isNumeric,
} from "metabase-lib/v1/types/utils/isa";
import type {
  Card,
  CardDisplayType,
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

export function getAreDimensionsValid(
  rawSeries: RawSeries,
  settings: ComputedVisualizationSettings,
) {
  return rawSeries.some(({ card, data }) =>
    columnsAreValid(
      card.visualization_settings["graph.dimensions"],
      data,
      settings["graph._dimension_filter"],
    ),
  );
}

export function getAreMetricsValid(
  rawSeries: RawSeries,
  settings: ComputedVisualizationSettings,
) {
  return rawSeries.some(({ card, data }) =>
    columnsAreValid(
      card.visualization_settings["graph.metrics"],
      data,
      settings["graph._metric_filter"],
    ),
  );
}

export function getDefaultDimensions(
  rawSeries: RawSeries,
  settings: ComputedVisualizationSettings,
) {
  return preserveExistingColumnsOrder(
    settings["graph.dimensions"] ?? [],
    getDefaultColumns(rawSeries).dimensions,
  );
}

export function getDefaultMetrics(rawSeries: RawSeries) {
  return getDefaultColumns(rawSeries).metrics;
}

export const STACKABLE_DISPLAY_TYPES = new Set(["area", "bar", "combo"]);

export const isStackingValueValid = (
  cardDisplay: CardDisplayType,
  settings: ComputedVisualizationSettings,
  seriesDisplays: string[],
) => {
  if (settings["stackable.stack_type"] == null) {
    return true;
  }
  if (!STACKABLE_DISPLAY_TYPES.has(cardDisplay)) {
    return false;
  }

  const stackableDisplays = seriesDisplays.filter(display =>
    STACKABLE_DISPLAY_TYPES.has(display),
  );
  return stackableDisplays.length > 1;
};

export const isShowStackValuesValid = (
  seriesDisplays: string[],
  settings: ComputedVisualizationSettings,
) => {
  const areAllAreas = seriesDisplays.every(display => display === "area");

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
    return keys.map(key => ({
      key,
      color: seriesColors[key],
      enabled: true,
      name: seriesSettings?.[key]?.title || key,
    }));
  };

  const removeMissingOrder = (keys: string[], order: SeriesOrderSetting[]) =>
    order.filter(o => keys.includes(o.key));
  const newKeys = (keys: string[], order: SeriesOrderSetting[]) =>
    keys.filter(key => !order.find(o => o.key === key));

  if (
    !seriesOrder ||
    !_.isArray(seriesOrder) ||
    !seriesOrder.every(
      order =>
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
  ].map(item => ({
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
    display =>
      display !== "area" && display !== "bar" && display !== "waterfall",
  );
};

export const getDefaultXAxisTitle = (
  dimensionColumn: DatasetColumn | undefined,
) => {
  if (!dimensionColumn) {
    return null;
  }

  return getFriendlyName(dimensionColumn);
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
) => {
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
  [{ data }]: RawSeries,
  settings: ComputedVisualizationSettings,
) => {
  const options = [];

  const dimensionColumn = data.cols.find(
    col => col != null && col.name === settings["graph.dimensions"]?.[0],
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
    option => option.value,
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
  const dimensions = data.cols.filter(isDimension);
  const metrics = data.cols.filter(isMetric);

  if (dimensions.length === 2 && metrics.length < 2) {
    return {
      dimensions: [dimensions[0].name],
      metrics: [dimensions[1].name],
      bubble: metrics.length === 1 ? metrics[0].name : null,
    };
  } else {
    return {
      dimensions: [null],
      metrics: [null],
      bubble: null,
    };
  }
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
