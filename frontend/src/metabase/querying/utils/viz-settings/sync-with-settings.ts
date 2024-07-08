import * as Lib from "metabase-lib";
import type { Series, VisualizationSettings } from "metabase-types/api";

type ColumnInfo = {
  name: string;
  desiredColumnAlias?: string;
  isAggregation: boolean;
};

export function syncVizSettingsWithQuery(
  settings: VisualizationSettings,
  newQuery: Lib.Query,
  oldQuery: Lib.Query,
): VisualizationSettings {
  const newColumns = getReturnedColumns(newQuery);
  const oldColumns = getReturnedColumns(oldQuery);
  return syncVizSettings(settings, newColumns, oldColumns);
}

export function syncVizSettingsWithSeries(
  settings: VisualizationSettings,
  newSeries?: Series | null,
  oldSeries?: Series | null,
): VisualizationSettings {
  const newColumns = getSeriesColumns(newSeries);
  const oldColumns = getSeriesColumns(oldSeries);
  return syncVizSettings(settings, newColumns, oldColumns);
}

function syncVizSettings(
  settings: VisualizationSettings,
  newColumns?: ColumnInfo[],
  oldColumns?: ColumnInfo[],
): VisualizationSettings {
  let nextSettings = settings;
  if (newColumns) {
    if (oldColumns) {
      nextSettings = syncTableColumnNames(nextSettings, newColumns, oldColumns);
      nextSettings = syncGraphMetricNames(nextSettings, newColumns, oldColumns);
    }
    nextSettings = syncAddedAndRemovedTableColumns(nextSettings, newColumns);
    nextSettings = syncAddedAndRemovedGraphMetrics(nextSettings, newColumns);
  }
  return nextSettings;
}

function getReturnedColumns(query: Lib.Query): ColumnInfo[] | undefined {
  const { isNative } = Lib.queryDisplayInfo(query);
  if (isNative) {
    return undefined;
  }

  const stageIndex = -1;
  return Lib.returnedColumns(query, stageIndex)
    .map(column => Lib.displayInfo(query, stageIndex, column))
    .map(columnInfo => ({
      name: columnInfo.name,
      desiredColumnAlias: columnInfo.desiredColumnAlis,
      isAggregation: columnInfo.isAggregation,
    }));
}

function getSeriesColumns(series?: Series | null): ColumnInfo[] | undefined {
  const singleSeries = series?.[0];
  if (!singleSeries?.data || singleSeries?.error) {
    return undefined;
  }

  return singleSeries.data.cols.map(column => ({
    name: column.name,
    desiredColumnAlias: undefined,
    isAggregation: column.source === "aggregation",
  }));
}

function syncColumnNames<T>(
  settings: T[],
  newColumns: ColumnInfo[],
  oldColumns: ColumnInfo[],
  getColumnName: (setting: T) => string,
  setColumnName: (setting: T, newName: string) => T,
): T[] {
  const newNameByAlias = new Map(
    newColumns.map(col => [col.desiredColumnAlias, col.name]),
  );
  const oldAliasByName = new Map(
    oldColumns.map(col => [col.name, col.desiredColumnAlias]),
  );

  return settings.map(setting => {
    const oldAlias = oldAliasByName.get(getColumnName(setting));
    const newName = newNameByAlias.get(oldAlias);
    if (!oldAlias || !newName) {
      return setting;
    }
    return setColumnName(setting, newName);
  });
}

function syncTableColumnNames(
  settings: VisualizationSettings,
  newColumns: ColumnInfo[],
  oldColumns: ColumnInfo[],
): VisualizationSettings {
  const columnSettings = settings["table.columns"];
  if (!columnSettings) {
    return settings;
  }

  return {
    ...settings,
    "table.columns": syncColumnNames(
      columnSettings,
      newColumns,
      oldColumns,
      setting => setting.name,
      (setting, newName) => ({ ...setting, name: newName }),
    ),
  };
}

function syncGraphMetricNames(
  settings: VisualizationSettings,
  newColumns: ColumnInfo[],
  oldColumns: ColumnInfo[],
): VisualizationSettings {
  const graphMetrics = settings["graph.metrics"];
  if (!graphMetrics) {
    return settings;
  }

  return {
    ...settings,
    "graph.metrics": syncColumnNames(
      graphMetrics,
      newColumns,
      oldColumns,
      setting => setting,
      (setting, newName) => newName,
    ),
  };
}

function syncAddedAndRemovedTableColumns(
  settings: VisualizationSettings,
  newColumns: ColumnInfo[],
) {
  const columnSettings = settings["table.columns"];
  if (!columnSettings) {
    return settings;
  }

  const oldColumnNames = new Set(
    columnSettings.map(columnSetting => columnSetting.name),
  );
  const addedColumnSettings = newColumns
    .filter(column => !oldColumnNames.has(column.name))
    .map(column => ({
      name: column.name,
      enabled: true,
    }));

  const newColumnNames = new Set(newColumns.map(column => column.name));
  const retainedColumnSettings = columnSettings.filter(columnSetting =>
    newColumnNames.has(columnSetting.name),
  );

  return {
    ...settings,
    "table.columns": [...retainedColumnSettings, ...addedColumnSettings],
  };
}

function syncAddedAndRemovedGraphMetrics(
  settings: VisualizationSettings,
  newColumns: ColumnInfo[],
): VisualizationSettings {
  const graphMetrics = settings["graph.metrics"];
  if (!graphMetrics) {
    return settings;
  }

  const oldColumnNames = new Set(graphMetrics);
  const addedGraphMetrics = newColumns
    .filter(column => !oldColumnNames.has(column.name) && column.isAggregation)
    .map(column => column.name);

  const newColumnNames = new Set(newColumns.map(column => column.name));
  const retainedGraphMetrics = graphMetrics.filter(columnName =>
    newColumnNames.has(columnName),
  );

  return {
    ...settings,
    "graph.metrics": [...retainedGraphMetrics, ...addedGraphMetrics],
  };
}
