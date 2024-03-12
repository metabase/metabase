import type { DrillThruContext } from "metabase-lib";
import {
  findColumnIndexesForColumnSettings,
  findColumnSettingIndexesForColumns,
} from "metabase-lib/v1/queries/utils/dataset";
import { getColumnKey } from "metabase-lib/v1/queries/utils/get-column-key";
import type { Dataset, VisualizationSettings } from "metabase-types/api";

export function syncColumnSettings(
  settings: VisualizationSettings,
  queryResults?: Dataset,
  prevQueryResults?: Dataset,
  drillContext?: DrillThruContext,
): VisualizationSettings {
  let newSettings = settings;

  if (queryResults && !queryResults.error) {
    newSettings = syncTableColumnSettings(
      newSettings,
      queryResults,
      drillContext == null,
    );

    if (prevQueryResults && !prevQueryResults.error) {
      newSettings = syncGraphMetricSettings(
        newSettings,
        queryResults,
        prevQueryResults,
      );

      if (drillContext) {
        newSettings = syncTableColumnSettingsAfterDrill(
          settings,
          queryResults,
          prevQueryResults,
          drillContext,
        );
      }
    }
  }

  return newSettings;
}

function syncTableColumnSettings(
  settings: VisualizationSettings,
  { data }: Dataset,
  isDefaultSkipped: boolean,
): VisualizationSettings {
  const columnSettings = settings["table.columns"] ?? [];
  // "table.columns" receive a value only if there are custom settings
  // e.g. some columns are hidden. If it's empty, it means everything is visible
  if (columnSettings.length === 0 && isDefaultSkipped) {
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

function syncTableColumnSettingsAfterDrill(
  settings: VisualizationSettings,
  { data: { cols } }: Dataset,
  { data: { cols: prevCols } }: Dataset,
  { column }: DrillThruContext,
): VisualizationSettings {
  const columnSettings = settings["table.columns"] ?? [];
  const prevColumnNames = new Set(prevCols.map(col => col.name));
  const addedColumns = cols.filter(col => !prevColumnNames.has(col.name));

  const [columnSettingIndex] = findColumnSettingIndexesForColumns(
    [column],
    columnSettings,
  );
  const prevColumnSettingIndexes = findColumnSettingIndexesForColumns(
    prevCols,
    columnSettings,
  );
  const addedColumnSettingIndexes = findColumnSettingIndexesForColumns(
    addedColumns,
    columnSettings,
  );

  const leftColumnSettings = prevColumnSettingIndexes
    .filter(index => index >= 0 && index <= columnSettingIndex)
    .map(index => columnSettings[index]);
  const rightColumnSettings = prevColumnSettingIndexes
    .filter(index => index >= 0 && index > columnSettingIndex)
    .map(index => columnSettings[index]);
  const addedColumnSettings = addedColumnSettingIndexes
    .filter(index => index >= 0)
    .map(index => columnSettings[index]);

  return {
    ...settings,
    "table.columns": [
      ...leftColumnSettings,
      ...addedColumnSettings,
      ...rightColumnSettings,
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
