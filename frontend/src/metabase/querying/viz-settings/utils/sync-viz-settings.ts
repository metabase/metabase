/* eslint-disable @typescript-eslint/no-unsafe-return -- FIXME: any-typed values */
import {
  getDeduplicatedTableColumnSettings,
  insertNewColumnSettings,
} from "metabase/viz-core";
import * as Lib from "metabase-lib";
import {
  getColumnKey,
  getColumnNameFromKey,
} from "metabase-lib/v1/queries/utils/column-key";
import {
  isColumnNameCollapsedRowsSetting,
  isColumnNameColumnSplitSetting,
} from "metabase-lib/v1/queries/utils/pivot";
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
  options: Pick<SyncVizSettingsOpts, "columnChange"> = {},
): VisualizationSettings {
  if (isNativeQuery(newQuery) || isNativeQuery(oldQuery)) {
    return settings;
  }

  const newColumns = getReturnedColumns(newQuery);
  const oldColumns = getReturnedColumns(oldQuery);
  return syncVizSettings(settings, newColumns, oldColumns, options);
}

export function syncVizSettingsWithSeries(
  settings: VisualizationSettings,
  newQuery: Lib.Query,
  newSeries: Series,
  oldSeries?: Series,
): VisualizationSettings {
  if (!isNativeQuery(newQuery)) {
    return settings;
  }

  const [newSingleSeries] = newSeries;
  const [oldSingleSeries] = oldSeries ?? [];
  if (!isValidSeries(newSingleSeries) || !isValidSeries(oldSingleSeries)) {
    return settings;
  }

  const newColumns = getSeriesColumns(newSingleSeries);
  const oldColumns = getSeriesColumns(oldSingleSeries);
  return syncVizSettings(settings, newColumns, oldColumns, {
    placeNewColumnsInQueryOrder: true,
  });
}

/** In-place changes preserve result column positions. Regrouping can move or merge breakouts. */
export type ColumnChange = "in-place" | "regrouped";

export type SyncVizSettingsOpts = {
  columnChange?: ColumnChange;
  placeNewColumnsInQueryOrder?: boolean;
};

export function syncVizSettings(
  settings: VisualizationSettings,
  newColumns: ColumnInfo[],
  oldColumns: ColumnInfo[],
  options: SyncVizSettingsOpts = {},
): VisualizationSettings {
  const matchedColumns = options.columnChange
    ? matchChangedColumns(newColumns, oldColumns, options.columnChange)
    : newColumns;
  let nextSettings = settings;
  nextSettings = syncTableColumns(
    nextSettings,
    matchedColumns,
    oldColumns,
    options,
  );
  nextSettings = syncColumnSettings(nextSettings, matchedColumns, oldColumns);
  nextSettings = syncGraphMetrics(nextSettings, matchedColumns, oldColumns);
  // The summary sidebar already accounts for renamed columns when it prepares the pivot split.
  nextSettings = syncPivotColumnSplit(nextSettings, newColumns, oldColumns);
  nextSettings = syncPivotCollapsedRows(nextSettings, newColumns, oldColumns);
  return nextSettings;
}

function isNativeQuery(query: Lib.Query) {
  const { isNative } = Lib.queryDisplayInfo(query);
  return isNative;
}

function getReturnedColumns(query: Lib.Query): ColumnInfo[] {
  const stageIndex = -1;
  return Lib.returnedColumns(query, stageIndex).map((column) => {
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
  return series.data.cols.map((column) => ({
    key: column.name,
    name: column.name,
    isAggregation: false,
  }));
}

type SyncColumnsOpts<T> = {
  settings: T[];
  newColumns: ColumnInfo[];
  oldColumns: ColumnInfo[];
  getColumnName: (setting: T) => string | undefined;
  setColumnName: (setting: T, newName: string) => T;
  createSetting: (column: ColumnInfo) => T;
  shouldCreateSetting?: (column: ColumnInfo) => boolean | undefined;
  placeNewColumnsInQueryOrder?: boolean;
};

function syncColumns<T>({
  settings,
  newColumns,
  oldColumns,
  getColumnName,
  setColumnName,
  createSetting,
  shouldCreateSetting = () => false,
  placeNewColumnsInQueryOrder = false,
}: SyncColumnsOpts<T>): T[] {
  const newNameByKey = Object.fromEntries(
    newColumns.map((column) => [column.key, column.name]),
  );
  const oldKeyByName = Object.fromEntries(
    oldColumns.map((column) => [column.name, column.key]),
  );
  const oldNameByKey = Object.fromEntries(
    oldColumns.map((column) => [column.key, column.name]),
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
  const remappedNames = new Set(remappedSettings.map(getColumnName));
  const isNewColumn = (column: ColumnInfo) =>
    !oldNameByKey[column.key] &&
    !remappedNames.has(column.name) &&
    shouldCreateSetting(column);

  if (!placeNewColumnsInQueryOrder) {
    return [
      ...remappedSettings,
      ...newColumns.filter(isNewColumn).map(createSetting),
    ];
  }

  return insertNewColumnSettings(remappedSettings, newColumns, {
    getColumnName,
    isNewColumn,
    createSetting,
  });
}

type SyncColumnNamesOpts = {
  settings: string[];
  newColumns: ColumnInfo[];
  oldColumns: ColumnInfo[];
  shouldCreateSetting?: (column: ColumnInfo) => boolean | undefined;
};

function syncColumnNames({
  settings,
  newColumns,
  oldColumns,
  shouldCreateSetting,
}: SyncColumnNamesOpts) {
  return syncColumns({
    settings,
    newColumns,
    oldColumns,
    getColumnName: (setting) => setting,
    setColumnName: (_, newName) => newName,
    createSetting: (column) => column.name,
    shouldCreateSetting,
  });
}

function syncTableColumns(
  settings: VisualizationSettings,
  newColumns: ColumnInfo[],
  oldColumns: ColumnInfo[],
  { placeNewColumnsInQueryOrder }: SyncVizSettingsOpts,
): VisualizationSettings {
  const columnSettings = settings["table.columns"];
  if (!columnSettings) {
    return settings;
  }

  return {
    ...settings,
    "table.columns": syncColumns({
      settings: getDeduplicatedTableColumnSettings(columnSettings),
      newColumns,
      oldColumns,
      getColumnName: (setting) => setting.name,
      setColumnName: (setting, newName) => ({ ...setting, name: newName }),
      createSetting: (column) => ({ name: column.name, enabled: true }),
      shouldCreateSetting: () => true,
      placeNewColumnsInQueryOrder,
    }),
  };
}

function matchColumnsByPosition(
  newColumns: ColumnInfo[],
  oldColumns: ColumnInfo[],
) {
  if (oldColumns.length !== newColumns.length) {
    return newColumns;
  }
  return newColumns.map((column, index) => ({
    ...column,
    key: oldColumns[index].key,
  }));
}

/**
 * Gives each new column the key of the old column it replaces. A rename can also change
 * the suffix of a sibling with the same name.
 */
function matchChangedColumns(
  newColumns: ColumnInfo[],
  oldColumns: ColumnInfo[],
  columnChange: ColumnChange,
) {
  if (columnChange === "in-place") {
    return matchColumnsByPosition(newColumns, oldColumns);
  }

  const newDimensions = newColumns.filter((column) => !column.isAggregation);
  const oldDimensions = oldColumns.filter((column) => !column.isAggregation);
  const oldKeys = new Set(oldDimensions.map((column) => column.key));
  const newKeys = new Set(newDimensions.map((column) => column.key));
  const renamed = newDimensions.filter((column) => !oldKeys.has(column.key));
  const replaced = oldDimensions.filter((column) => !newKeys.has(column.key));

  return [
    // Rebuilding a formula's breakouts can move other groupings. Match those by key first.
    ...newDimensions.filter((column) => oldKeys.has(column.key)),
    // When several groupings collapse into one, it keeps the settings of the first.
    ...matchColumnsByPosition(renamed, replaced.slice(0, renamed.length)),
    ...matchColumnsByPosition(
      newColumns.filter((column) => column.isAggregation),
      oldColumns.filter((column) => column.isAggregation),
    ),
  ];
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
    setColumnName: ([_key, setting], name) => [getColumnKey({ name }), setting],
    createSetting: (column) => [getColumnKey(column), {}],
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
    "graph.metrics": syncColumnNames({
      settings: graphMetrics,
      newColumns,
      oldColumns,
      shouldCreateSetting: (column) => column.isAggregation,
    }),
  };
}

function syncPivotColumnSplit(
  settings: VisualizationSettings,
  newColumns: ColumnInfo[],
  oldColumns: ColumnInfo[],
): VisualizationSettings {
  const columnSettings = settings["pivot_table.column_split"];
  if (!columnSettings || !isColumnNameColumnSplitSetting(columnSettings)) {
    return settings;
  }

  return {
    ...settings,
    "pivot_table.column_split": {
      ...columnSettings,
      rows: syncColumnNames({
        settings: columnSettings.rows ?? [],
        newColumns,
        oldColumns,
      }),
      columns: syncColumnNames({
        settings: columnSettings.columns ?? [],
        newColumns,
        oldColumns,
      }),
      values: syncColumnNames({
        settings: columnSettings.values ?? [],
        newColumns,
        oldColumns,
      }),
    },
  };
}

function syncPivotCollapsedRows(
  settings: VisualizationSettings,
  newColumns: ColumnInfo[],
  oldColumns: ColumnInfo[],
): VisualizationSettings {
  const rowSettings = settings["pivot_table.collapsed_rows"];
  if (!rowSettings || !isColumnNameCollapsedRowsSetting(rowSettings)) {
    return settings;
  }

  return {
    ...settings,
    "pivot_table.collapsed_rows": {
      ...rowSettings,
      rows: syncColumnNames({
        settings: rowSettings.rows ?? [],
        newColumns,
        oldColumns,
      }),
    },
  };
}
