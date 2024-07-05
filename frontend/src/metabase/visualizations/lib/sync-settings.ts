import {
  findColumnIndexesForColumnSettings,
  findColumnSettingIndexesForColumns,
} from "metabase-lib/v1/queries/utils/dataset";
import type {
  Series,
  SingleSeries,
  VisualizationSettings,
} from "metabase-types/api";

export function syncVizSettingsWithSeries(
  settings: VisualizationSettings,
  _series?: Series | null,
  _previousSeries?: Series | null,
): VisualizationSettings {
  let newSettings = settings;

  const series = _series?.[0];
  const previousSeries = _previousSeries?.[0];

  if (series?.data && !series?.error) {
    if (previousSeries?.data && !previousSeries?.error) {
      newSettings = syncTableColumnNames(settings, series, previousSeries);
      newSettings = syncGraphMetricSettings(
        newSettings,
        series,
        previousSeries,
      );
    }

    newSettings = syncNewTableColumnSettings(newSettings, series);
  }

  return newSettings;
}

function syncTableColumnNames(
  settings: VisualizationSettings,
  { data: { cols } }: SingleSeries,
  { data: { cols: prevCols } }: SingleSeries,
) {
  const columnSettings = settings["table.columns"] ?? [];
  if (columnSettings.length === 0) {
    return settings;
  }

  const newNameById = new Map(
    cols.filter(col => col.id != null).map(col => [col.id, col.name]),
  );
  const prevIdByName = new Map(
    prevCols.filter(col => col.id != null).map(col => [col.name, col.id]),
  );

  return {
    ...settings,
    "table.columns": columnSettings.map(setting => {
      const prevId = prevIdByName.get(setting.name);
      const newName = newNameById.get(prevId);
      if (newName != null && newName !== setting.name) {
        return { ...setting, name: newName };
      }
      return setting;
    }),
  };
}

function syncNewTableColumnSettings(
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

  const allColumnNames = new Set(cols.map(column => column.name));
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
    [...prevMetricColumnNames].filter(name => !allColumnNames.has(name)),
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
