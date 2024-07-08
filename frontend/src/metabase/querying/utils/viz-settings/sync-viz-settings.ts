import * as Lib from "metabase-lib";
import type {
  Series,
  SingleSeries,
  VisualizationSettings,
} from "metabase-types/api";

export type ColumnInfo = {
  name: string;
  alias: string;
  isAggregation?: boolean;
};

export function syncVizSettingsWithQuery(
  settings: VisualizationSettings,
  newQuery: Lib.Query,
  oldQuery: Lib.Query,
): VisualizationSettings {
  if (isNativeQuery(newQuery) || isNativeQuery(oldQuery)) {
    return settings;
  }

  const newColumns = getReturnedColumns(newQuery);
  const oldColumns = getReturnedColumns(oldQuery);
  return syncVizSettings(settings, newColumns, oldColumns);
}

export function syncVizSettingsWithSeries(
  settings: VisualizationSettings,
  newQuery: Lib.Query,
  newSeries: Series,
  oldSeries: Series,
): VisualizationSettings {
  if (!isNativeQuery(newQuery)) {
    return settings;
  }

  const [newSingleSeries] = newSeries;
  const [oldSingleSeries] = oldSeries;
  if (!isValidSeries(newSingleSeries) || !isValidSeries(oldSingleSeries)) {
    return settings;
  }

  const newColumns = getSeriesColumns(newSingleSeries);
  const oldColumns = getSeriesColumns(oldSingleSeries);
  return syncVizSettings(settings, newColumns, oldColumns);
}

export function syncVizSettings(
  settings: VisualizationSettings,
  newColumns: ColumnInfo[],
  oldColumns: ColumnInfo[],
): VisualizationSettings {
  let nextSettings = settings;
  nextSettings = syncTableColumns(nextSettings, newColumns, oldColumns);
  nextSettings = syncGraphMetrics(nextSettings, newColumns, oldColumns);
  return nextSettings;
}

function isNativeQuery(query: Lib.Query) {
  const { isNative } = Lib.queryDisplayInfo(query);
  return isNative;
}

function getReturnedColumns(query: Lib.Query): ColumnInfo[] {
  const stageIndex = -1;
  return Lib.returnedColumns(query, stageIndex)
    .map(column => Lib.displayInfo(query, stageIndex, column))
    .map(columnInfo => ({
      name: columnInfo.name,
      alias: columnInfo.desiredColumnAlias ?? columnInfo.name,
      isAggregation: columnInfo.isAggregation,
    }));
}

function isValidSeries(series: SingleSeries) {
  return series.data && !series.error;
}

function getSeriesColumns(series: SingleSeries): ColumnInfo[] {
  return series.data.cols.map(column => ({
    name: column.name,
    alias: column.name,
    isAggregation: column.source === "aggregation",
  }));
}

type SyncColumnNamesOpts<T> = {
  settings: T[];
  newColumns: ColumnInfo[];
  oldColumns: ColumnInfo[];
  getColumnName: (setting: T) => string;
  setColumnName: (setting: T, newName: string) => T;
  createSetting: (column: ColumnInfo) => T;
  shouldCreateSetting: (column: ColumnInfo) => boolean | undefined;
};

function syncColumns<T>({
  settings,
  newColumns,
  oldColumns,
  getColumnName,
  setColumnName,
  createSetting,
  shouldCreateSetting,
}: SyncColumnNamesOpts<T>): T[] {
  const newNameByAlias = Object.fromEntries(
    newColumns.map(column => [column.alias, column.name]),
  );
  const oldAliasByName = Object.fromEntries(
    oldColumns.map(column => [column.name, column.alias]),
  );
  const oldNameByAlias = Object.fromEntries(
    oldColumns.map(column => [column.alias, column.name]),
  );
  const existingSettings = settings
    .map(setting => ({
      alias: oldAliasByName[getColumnName(setting)],
      setting,
    }))
    .filter(({ alias }) => !alias || newNameByAlias[alias])
    .map(({ alias, setting }) =>
      alias ? setColumnName(setting, newNameByAlias[alias]) : setting,
    );
  const addedSettings = newColumns
    .filter(column => !oldNameByAlias[column.alias])
    .filter(shouldCreateSetting)
    .map(createSetting);

  return [...existingSettings, ...addedSettings];
}

function syncTableColumns(
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
    "table.columns": syncColumns({
      settings: columnSettings,
      newColumns,
      oldColumns,
      getColumnName: setting => setting.name,
      setColumnName: (setting, newName) => ({ ...setting, name: newName }),
      createSetting: column => ({ name: column.name, enabled: true }),
      shouldCreateSetting: () => true,
    }),
  };
}

function syncGraphMetrics(
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
    "graph.metrics": syncColumns({
      settings: graphMetrics,
      newColumns,
      oldColumns,
      getColumnName: setting => setting,
      setColumnName: (_, newName) => newName,
      createSetting: column => column.name,
      shouldCreateSetting: column => column.isAggregation,
    }),
  };
}
