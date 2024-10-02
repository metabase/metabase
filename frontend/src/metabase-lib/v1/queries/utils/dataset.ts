import type { DatasetData, TableColumnOrderSetting } from "metabase-types/api";

import type { DatasetColumnReference } from "./column-key";

export const datasetContainsNoResults = (data: DatasetData) =>
  data.rows == null || data.rows.length === 0;

export function findColumnIndexesForColumnSettings(
  columns: DatasetColumnReference[],
  columnSettings: TableColumnOrderSetting[],
) {
  const columnIndexByKey = new Map(
    columns.map((column, index) => [column.name, index]),
  );
  return columnSettings.map(
    columnSetting => columnIndexByKey.get(columnSetting.name) ?? -1,
  );
}

export function findColumnSettingIndexesForColumns(
  columns: DatasetColumnReference[],
  columnSettings: TableColumnOrderSetting[],
) {
  const columnSettingIndexByKey = new Map(
    columnSettings.map((columnSetting, index) => [columnSetting.name, index]),
  );
  return columns.map(column => columnSettingIndexByKey.get(column.name) ?? -1);
}
