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
      newSettings = syncGraphMetricSettings(
        newSettings,
        series,
        previousSeries,
      );

      newSettings = syncTableColumnSettingsWithoutAlias(
        newSettings,
        previousSeries,
      );
    }

    newSettings = syncNewTableColumnSettings(newSettings, series);
  }

  return newSettings;
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
    desired_column_alias: col.desired_column_alias,
    fieldRef: col.field_ref,
    enabled: true,
  }));

  return {
    ...settings,
    "table.columns": [...existingColumnSettings, ...addedColumnSettings],
  };
}

// Legacy `table.columns` might not have `desired_column_alias` set.
// We can set `desired_column_alias` based on the previous (current, not new)
// query results here, and it will be saved when the current ad-hoc question
// is saved.
function syncTableColumnSettingsWithoutAlias(
  settings: VisualizationSettings,
  { data }: SingleSeries,
): VisualizationSettings {
  const columnSettings = settings["table.columns"] ?? [];
  if (columnSettings.every(setting => setting.desired_column_alias)) {
    return settings;
  }

  const columnIndexes = findColumnIndexesForColumnSettings(
    data.cols,
    columnSettings,
  );

  const newColumnSettings = columnSettings.map((setting, settingIndex) => ({
    ...setting,
    desired_column_alias:
      data.cols[columnIndexes[settingIndex]]?.desired_column_alias ??
      setting.desired_column_alias,
  }));

  return {
    ...settings,
    "table.columns": newColumnSettings,
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
