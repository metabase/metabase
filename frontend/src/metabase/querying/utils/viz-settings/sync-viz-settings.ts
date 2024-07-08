import * as Lib from "metabase-lib";
import type { Series, VisualizationSettings } from "metabase-types/api";

export type ColumnInfo = {
  name: string;
  desiredColumnAlias?: string;
  isAggregation?: boolean;
};

export function syncVizSettingsWithQuery(
  settings: VisualizationSettings,
  newQuery: Lib.Query,
  oldQuery: Lib.Query | undefined,
): VisualizationSettings {
  const newColumns = getReturnedColumns(newQuery);
  const oldColumns = getReturnedColumns(oldQuery);
  return syncVizSettings(settings, newColumns, oldColumns);
}

export function syncVizSettingsWithSeries(
  settings: VisualizationSettings,
  newSeries: Series | null | undefined,
  oldSeries: Series | null | undefined,
): VisualizationSettings {
  const newColumns = getSeriesColumns(newSeries);
  const oldColumns = getSeriesColumns(oldSeries);
  return syncVizSettings(settings, newColumns, oldColumns);
}

export function syncVizSettings(
  settings: VisualizationSettings,
  newColumns: ColumnInfo[] | undefined,
  oldColumns: ColumnInfo[] | undefined,
): VisualizationSettings {
  if (!newColumns || !oldColumns) {
    return settings;
  }

  let nextSettings = settings;
  nextSettings = syncTableColumnNames(nextSettings, newColumns, oldColumns);
  nextSettings = syncGraphMetricNames(nextSettings, newColumns, oldColumns);
  nextSettings = syncAddedAndRemovedTableColumns(
    nextSettings,
    newColumns,
    oldColumns,
  );
  nextSettings = syncAddedAndRemovedGraphMetrics(
    nextSettings,
    newColumns,
    oldColumns,
  );
  return nextSettings;
}

function getReturnedColumns(
  query: Lib.Query | undefined,
): ColumnInfo[] | undefined {
  if (!query) {
    return undefined;
  }

  const { isNative } = Lib.queryDisplayInfo(query);
  if (isNative) {
    return undefined;
  }

  const stageIndex = -1;
  return Lib.returnedColumns(query, stageIndex)
    .map(column => Lib.displayInfo(query, stageIndex, column))
    .map(columnInfo => ({
      name: columnInfo.name,
      desiredColumnAlias: columnInfo.desiredColumnAlias,
      isAggregation: columnInfo.isAggregation,
    }));
}

function getSeriesColumns(
  series: Series | null | undefined,
): ColumnInfo[] | undefined {
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

type SyncColumnNamesOpts<T> = {
  settings: T[];
  newColumns: ColumnInfo[];
  oldColumns: ColumnInfo[];
  getColumnName: (setting: T) => string;
  setColumnName: (setting: T, newName: string) => T;
};

function syncColumnNames<T>({
  settings,
  newColumns,
  oldColumns,
  getColumnName,
  setColumnName,
}: SyncColumnNamesOpts<T>): T[] {
  const newColumnNameByAlias = new Map(
    newColumns.map(column => [column.desiredColumnAlias, column.name]),
  );
  const oldColumnAliasByName = new Map(
    oldColumns.map(column => [column.name, column.desiredColumnAlias]),
  );

  return settings.reduce((newSettings: T[], setting: T) => {
    const oldColumnName = getColumnName(setting);
    const oldColumnAlias = oldColumnAliasByName.get(oldColumnName);
    const newColumnName = newColumnNameByAlias.get(oldColumnAlias);
    if (!oldColumnAlias) {
      newSettings.push(setting);
    } else if (newColumnName) {
      newSettings.push(setColumnName(setting, newColumnName));
    }
    return newSettings;
  }, []);
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
    "table.columns": syncColumnNames({
      settings: columnSettings,
      newColumns,
      oldColumns,
      getColumnName: setting => setting.name,
      setColumnName: (setting, newName) => ({ ...setting, name: newName }),
    }),
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
    "graph.metrics": syncColumnNames({
      settings: graphMetrics,
      newColumns,
      oldColumns,
      getColumnName: setting => setting,
      setColumnName: (_, newName) => newName,
    }),
  };
}

type SyncAddedAndRemovedColumnsOpts<T> = {
  settings: T[];
  newColumns: ColumnInfo[];
  oldColumns: ColumnInfo[];
  getColumnName: (setting: T) => string;
  createSetting: (column: ColumnInfo) => T;
  canCreateSetting: (column: ColumnInfo) => boolean | undefined;
};

function syncAddedAndRemovedColumns<T>({
  settings,
  newColumns,
  oldColumns,
  getColumnName,
  createSetting,
  canCreateSetting,
}: SyncAddedAndRemovedColumnsOpts<T>): T[] {
  const oldColumnNames = new Set(oldColumns.map(column => column.name));
  const addedSettings = newColumns
    .filter(column => !oldColumnNames.has(column.name))
    .filter(canCreateSetting)
    .map(createSetting);

  const newColumnNames = new Set(newColumns.map(column => column.name));
  const retainedSettings = settings.filter(setting => {
    const columnName = getColumnName(setting);
    return (
      !oldColumnNames.has(columnName) ||
      newColumnNames.has(getColumnName(setting))
    );
  });

  return [...retainedSettings, ...addedSettings];
}

function syncAddedAndRemovedTableColumns(
  settings: VisualizationSettings,
  newColumns: ColumnInfo[],
  oldColumns: ColumnInfo[],
) {
  const columnSettings = settings["table.columns"];
  if (!columnSettings) {
    return settings;
  }

  return {
    ...settings,
    "table.columns": syncAddedAndRemovedColumns({
      settings: columnSettings,
      newColumns,
      oldColumns,
      getColumnName: setting => setting.name,
      createSetting: column => ({ name: column.name, enabled: true }),
      canCreateSetting: () => true,
    }),
  };
}

function syncAddedAndRemovedGraphMetrics(
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
    "graph.metrics": syncAddedAndRemovedColumns({
      settings: graphMetrics,
      newColumns,
      oldColumns,
      getColumnName: setting => setting,
      createSetting: column => column.name,
      canCreateSetting: column => column.isAggregation,
    }),
  };
}
