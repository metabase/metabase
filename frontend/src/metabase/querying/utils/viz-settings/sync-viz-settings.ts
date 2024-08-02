import * as Lib from "metabase-lib";
import {
  getColumnKey,
  getColumnNameFromKey,
} from "metabase-lib/v1/queries/utils/column-key";
import type {
  ColumnSettings,
  Series,
  SingleSeries,
  VisualizationSettings,
} from "metabase-types/api";

export type ColumnInfo = {
  key: string;
  name: string;
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
  nextSettings = syncColumnSettings(nextSettings, newColumns, oldColumns);
  nextSettings = syncGraphMetrics(nextSettings, newColumns, oldColumns);
  return nextSettings;
}

function isNativeQuery(query: Lib.Query) {
  const { isNative } = Lib.queryDisplayInfo(query);
  return isNative;
}

function getReturnedColumns(query: Lib.Query): ColumnInfo[] {
  const stageIndex = -1;
  return Lib.returnedColumns(query, stageIndex).map(column => {
    const columnInfo = Lib.displayInfo(query, stageIndex, column);
    return {
      key: Lib.columnKey(column),
      name: columnInfo.name,
      isAggregation: columnInfo.isAggregation,
    };
  });
}

function isValidSeries(series: SingleSeries) {
  return series.data && !series.error;
}

function getSeriesColumns(series: SingleSeries): ColumnInfo[] {
  return series.data.cols.map(column => ({
    key: column.name,
    name: column.name,
    isAggregation: false,
  }));
}

type SyncColumnNamesOpts<T> = {
  settings: T[];
  newColumns: ColumnInfo[];
  oldColumns: ColumnInfo[];
  getColumnName: (setting: T) => string | undefined;
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
  const newNameByKey = Object.fromEntries(
    newColumns.map(column => [column.key, column.name]),
  );
  const oldKeyByName = Object.fromEntries(
    oldColumns.map(column => [column.name, column.key]),
  );
  const oldNameByKey = Object.fromEntries(
    oldColumns.map(column => [column.key, column.name]),
  );
  const remappedSettings = settings.reduce((settings: T[], setting) => {
    const oldName = getColumnName(setting);
    const oldKey = oldName && oldKeyByName[oldName];
    const newName = oldKey && newNameByKey[oldKey];
    if (!oldKey) {
      settings.push(setting);
    } else if (newName) {
      settings.push(setColumnName(setting, newName));
    }
    return settings;
  }, []);
  const addedSettings = newColumns
    .filter(column => !oldNameByKey[column.key])
    .filter(shouldCreateSetting)
    .map(createSetting);

  return [...remappedSettings, ...addedSettings];
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

function syncColumnSettings(
  settings: VisualizationSettings,
  newColumns: ColumnInfo[],
  oldColumns: ColumnInfo[],
): VisualizationSettings {
  const columnSettings = settings["column_settings"];
  if (!columnSettings) {
    return settings;
  }

  const columnEntries = syncColumns<[string, ColumnSettings]>({
    settings: Object.entries(columnSettings),
    newColumns,
    oldColumns,
    getColumnName: ([key]) => getColumnNameFromKey(key),
    setColumnName: ([_, setting], name) => [getColumnKey({ name }), setting],
    createSetting: column => [getColumnKey(column), {}],
    shouldCreateSetting: () => false,
  });

  return {
    ...settings,
    column_settings: Object.fromEntries(columnEntries),
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
