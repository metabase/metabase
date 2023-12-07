import _ from "underscore";
import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
import type {
  Card,
  DatasetColumn,
  DatasetData,
  SeriesOrderSetting,
} from "metabase-types/api";
import { getFriendlyName } from "metabase/visualizations/lib/utils";
import { dimensionIsNumeric } from "metabase/visualizations/lib/numeric";
import { dimensionIsTimeseries } from "metabase/visualizations/lib/timeseries";
import { isDimension, isMetric } from "metabase-lib/types/utils/isa";

export const STACKABLE_DISPLAY_TYPES = new Set(["area", "bar"]);

export const isStackingValueValid = (
  settings: ComputedVisualizationSettings,
  seriesDisplays: string[],
) => {
  if (settings["stackable.stack_type"] != null) {
    const stackableDisplays = seriesDisplays.filter(display =>
      STACKABLE_DISPLAY_TYPES.has(display),
    );
    return stackableDisplays.length > 1;
  }
  return true;
};

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

/**
 * Returns the column name for the bubble size setting
 * on the scatter plot. It will simply use the column name saved
 * in viz settings is there is one, otherwise it will try to choose
 * a default. If there is no suitable default, it will return `null`.
 * Logic is copied from `getScatterColumn` in `visualizations/lib/settings/graph.js`
 *
 * @param vizSettings - Computed visualization settings
 * @param data - property from the series object from the `rawSeries` array
 * @returns column name string or `null`
 *
 * @example
 * const vizSettings = { "scatter.bubble": "some_col" }
 * const sizeCol = getDefaultBubbleSizeCol(vizSettings, data)
 * console.log(sizeCol)
 * // "some_col"
 */
export function getDefaultBubbleSizeCol(
  vizSettings: ComputedVisualizationSettings,
  data: DatasetData,
) {
  // TODO remove this it's uncessary
  if (vizSettings["scatter.bubble"]) {
    return vizSettings["scatter.bubble"];
  }

  // TODO use generic getScatterDefaultCols func instead
  const dimensions = data.cols.filter(isDimension);
  const metrics = data.cols.filter(isMetric);
  return dimensions.length === 2 && metrics.length === 1
    ? metrics[0].name
    : null;
}
