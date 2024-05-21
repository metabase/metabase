import {
  findColumnIndexesForColumnSettings,
  findColumnSettingIndexesForColumns,
} from "metabase-lib/v1/queries/utils/dataset";
import { getColumnKey } from "metabase-lib/v1/queries/utils/get-column-key";
import type {
  Dataset,
  DatasetColumn,
  VisualizationSettings,
} from "metabase-types/api";

export type SettingsSyncOptions = {
  column: DatasetColumn;
};

export function syncColumnSettings(
  settings: VisualizationSettings,
  queryResults?: Dataset,
  prevQueryResults?: Dataset,
  options?: SettingsSyncOptions,
): VisualizationSettings {
  let newSettings = settings;

  if (queryResults && !queryResults.error) {
    newSettings = syncTableColumnSettings(newSettings, queryResults, options);

    if (prevQueryResults && !prevQueryResults.error) {
      newSettings = syncGraphMetricSettings(
        newSettings,
        queryResults,
        prevQueryResults,
      );

      if (options) {
        newSettings = moveNewTableColumnsAfterColumn(
          newSettings,
          queryResults,
          prevQueryResults,
          options,
        );
      }
    }
  }

  return newSettings;
}

function syncTableColumnSettings(
  settings: VisualizationSettings,
  { data }: Dataset,
  options?: SettingsSyncOptions,
): VisualizationSettings {
  // "table.columns" receive a value only if there are custom settings
  // e.g. some columns are hidden. If it's empty, it means everything is visible
  const columnSettings = settings["table.columns"] ?? [];
  if (columnSettings.length === 0 && !options?.column) {
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
  const addedColumns = cols.filter((col, colIndex) => {
    const hasVizSettings = columnSettingIndexes[colIndex] >= 0;
    return !hasVizSettings;
  });
  const existingColumnSettings = columnSettings.filter(
    (setting, settingIndex) => columnIndexes[settingIndex] >= 0,
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

function moveNewTableColumnsAfterColumn(
  settings: VisualizationSettings,
  { data: { cols } }: Dataset,
  { data: { cols: prevCols } }: Dataset,
  { column }: SettingsSyncOptions,
): VisualizationSettings {
  const columnSettings = settings["table.columns"];
  if (!column || !columnSettings) {
    return settings;
  }

  const prevColumnNames = new Set(prevCols.map(col => col.name));
  const addedColumns = cols.filter(col => !prevColumnNames.has(col.name));
  const addedColumnSettingIndexes = findColumnSettingIndexesForColumns(
    addedColumns,
    columnSettings,
  );
  const addedColumnSettings = addedColumnSettingIndexes.map(
    index => columnSettings[index],
  );
  const existingColumnSettings = columnSettings.filter(
    (_, index) => !addedColumnSettingIndexes.includes(index),
  );
  const [columnSettingIndex] = findColumnSettingIndexesForColumns(
    [column],
    existingColumnSettings,
  );
  if (columnSettingIndex < 0) {
    return settings;
  }

  return {
    ...settings,
    "table.columns": [
      ...existingColumnSettings.slice(0, columnSettingIndex + 1), // before and including the selected column
      ...addedColumnSettings,
      ...existingColumnSettings.slice(columnSettingIndex + 1), // after the selected column
    ],
  };
}

function syncGraphMetricSettings(
  settings: VisualizationSettings,
  { data: { cols } }: Dataset,
  { data: { cols: prevCols } }: Dataset,
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
