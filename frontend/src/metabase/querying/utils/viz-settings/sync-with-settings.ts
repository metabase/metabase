import * as Lib from "metabase-lib";
import type { Series, VisualizationSettings } from "metabase-types/api";

type ColumnInfo = {
  name: string;
  desiredColumnAlias?: string;
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
    }
    nextSettings = syncAddedAndRemovedTableColumns(nextSettings, newColumns);
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
  }));
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

  const newNameByAlias = new Map(
    newColumns.map(col => [col.desiredColumnAlias, col.name]),
  );
  const oldAliasByName = new Map(
    oldColumns.map(col => [col.name, col.desiredColumnAlias]),
  );

  return {
    ...settings,
    "table.columns": columnSettings.map(setting => {
      const oldAlias = oldAliasByName.get(setting.name);
      const newName = newNameByAlias.get(oldAlias);
      if (!oldAlias || !newName) {
        return setting;
      }
      return { ...setting, name: newName };
    }),
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
  const newColumnNames = new Set(newColumns.map(column => column.name));
  const addedColumns = newColumns.filter(
    column => !oldColumnNames.has(column.name),
  );
  const retainedColumnSettings = columnSettings.filter(columnSetting =>
    newColumnNames.has(columnSetting.name),
  );

  return {
    ...settings,
    "table.columns": [
      ...retainedColumnSettings,
      ...addedColumns.map(column => ({
        name: column.name,
        enabled: true,
      })),
    ],
  };
}
