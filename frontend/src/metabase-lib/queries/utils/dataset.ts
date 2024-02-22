import type {
  DatasetColumn,
  DatasetData,
  TableColumnOrderSetting,
} from "metabase-types/api";

export const datasetContainsNoResults = (data: DatasetData) =>
  data.rows == null || data.rows.length === 0;

export function findColumnIndexesForColumnSettings(
  columns: DatasetColumn[],
  columnSettings: TableColumnOrderSetting[],
) {
  const columnIndexByName = new Map(
    columns.map(({ name }, index) => [name, index]),
  );
  return columnSettings.map(({ name }) => columnIndexByName.get(name) ?? -1);
}

export function findColumnSettingIndexesForColumns(
  columns: DatasetColumn[],
  columnSettings: TableColumnOrderSetting[],
) {
  const columnSettingIndexByName = new Map(
    columnSettings.map(({ name }, index) => [name, index]),
  );
  return columns.map(({ name }) => columnSettingIndexByName.get(name) ?? -1);
}
