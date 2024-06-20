import { isNotNull } from "metabase/lib/types";
import {
  getMaxDimensionsSupported,
  getMaxMetricsSupported,
  hasGraphDataSettings,
} from "metabase/visualizations";
import {
  findColumnIndexesForColumnSettings,
  findColumnSettingIndexesForColumns,
} from "metabase-lib/v1/queries/utils/dataset";
import { getColumnKey } from "metabase-lib/v1/queries/utils/get-column-key";
import type {
  Series,
  SingleSeries,
  VisualizationSettings,
} from "metabase-types/api";

import { getSingleSeriesDimensionsAndMetrics } from "./utils";

export function syncVizSettingsWithSeries(
  settings: VisualizationSettings,
  _series?: Series | null,
  _previousSeries?: Series | null,
): VisualizationSettings {
  let newSettings = settings;

  const series = _series?.[0];
  const previousSeries = _previousSeries?.[0];

  if (series?.data && !series.error) {
    newSettings = syncTableColumnSettings(newSettings, series);

    if (previousSeries?.data && !previousSeries.error) {
      newSettings = syncGraphMetricSettings(
        newSettings,
        series,
        previousSeries,
      );

      if (hasGraphDataSettings(series.card.display)) {
        newSettings = ensureMetricsAndDimensions(
          newSettings,
          series,
          previousSeries,
        );
      }
    }
  }

  return newSettings;
}

function ensureMetricsAndDimensions(
  settings: VisualizationSettings,
  series: SingleSeries,
  previousSeries: SingleSeries,
) {
  const hasExplicitGraphDataSettings =
    "graph.dimensions" in settings || "graph.metrics" in settings;

  if (hasExplicitGraphDataSettings) {
    return settings;
  }

  const nextSettings = { ...settings };

  const availableColumnNames = series.data.cols.map(col => col.name);
  const maxDimensions = getMaxDimensionsSupported(series.card.display);
  const maxMetrics = getMaxMetricsSupported(series.card.display);

  const { dimensions: currentDimensions, metrics: currentMetrics } =
    getSingleSeriesDimensionsAndMetrics(series, maxDimensions, maxMetrics);
  const { dimensions: previousDimensions, metrics: previousMetrics } =
    getSingleSeriesDimensionsAndMetrics(
      previousSeries,
      maxDimensions,
      maxMetrics,
    );

  const dimensions =
    currentDimensions.filter(isNotNull).length > 0
      ? currentDimensions
      : previousDimensions.filter((columnName: string) =>
          availableColumnNames.includes(columnName),
        );

  const metrics =
    currentMetrics.filter(isNotNull).length > 0
      ? currentMetrics
      : previousMetrics.filter((columnName: string) =>
          availableColumnNames.includes(columnName),
        );

  if (dimensions.length > 0) {
    nextSettings["graph.dimensions"] = dimensions;
  }
  if (metrics.length > 0) {
    nextSettings["graph.metrics"] = metrics;
  }

  return nextSettings;
}

function syncTableColumnSettings(
  settings: VisualizationSettings,
  { data }: SingleSeries,
): VisualizationSettings {
  // "table.columns" receive a value only if there are custom settings
  // e.g. some columns are hidden. If it's empty, it means everything is visible
  const columnSettings = settings["table.columns"] ?? [];
  if (columnSettings.length === 0) {
    return settings;
  }

  // remove columns used for remapping only
  const cols = data.cols.filter(col => col.remapped_from == null);
  const columnIndexes = findColumnIndexesForColumnSettings(
    cols,
    columnSettings,
  );
  const columnSettingIndexes = findColumnSettingIndexesForColumns(
    cols,
    columnSettings,
  );
  const addedColumns = cols.filter((_, colIndex) => {
    const hasVizSettings = columnSettingIndexes[colIndex] >= 0;
    return !hasVizSettings;
  });
  const existingColumnSettings = columnSettings.filter(
    (_, settingIndex) => columnIndexes[settingIndex] >= 0,
  );
  const noColumnsRemoved =
    existingColumnSettings.length === columnSettings.length;

  if (noColumnsRemoved && addedColumns.length === 0) {
    return settings;
  }

  const addedColumnSettings = addedColumns.map(col => ({
    name: col.name,
    key: getColumnKey(col),
    fieldRef: col.field_ref,
    enabled: true,
  }));

  return {
    ...settings,
    "table.columns": [...existingColumnSettings, ...addedColumnSettings],
  };
}

function syncGraphMetricSettings(
  settings: VisualizationSettings,
  { data: { cols } }: SingleSeries,
  { data: { cols: prevCols } }: SingleSeries,
): VisualizationSettings {
  const graphMetrics = settings["graph.metrics"];
  if (!graphMetrics) {
    return settings;
  }

  const hasNativeColumns =
    cols.some(column => column.source === "native") ||
    prevCols.some(column => column.source === "native");
  if (hasNativeColumns) {
    return settings;
  }

  const metricColumnNames = new Set(
    cols
      .filter(column => column.source === "aggregation")
      .map(column => column.name),
  );
  const prevMetricColumnNames = new Set(
    prevCols
      .filter(column => column.source === "aggregation")
      .map(column => column.name),
  );
  const addedMetricColumnNames = new Set(
    [...metricColumnNames].filter(name => !prevMetricColumnNames.has(name)),
  );
  const removedMetricColumnNames = new Set(
    [...prevMetricColumnNames].filter(name => !metricColumnNames.has(name)),
  );
  if (
    addedMetricColumnNames.size === 0 &&
    removedMetricColumnNames.size === 0
  ) {
    return settings;
  }

  return {
    ...settings,
    "graph.metrics": [
      ...graphMetrics.filter(name => !removedMetricColumnNames.has(name)),
      ...addedMetricColumnNames,
    ],
  };
}
