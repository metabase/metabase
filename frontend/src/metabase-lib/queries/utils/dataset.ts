import { getColumnKey } from "metabase-lib/queries/utils/get-column-key";
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
  const columnIndexByKey = new Map(
    columns.map((column, index) => [getColumnKey(column), index]),
  );
  return columnSettings.map(({ key }) => columnIndexByKey.get(key) ?? -1);
}

export function findColumnSettingIndexesForColumns(
  columns: DatasetColumn[],
  columnSettings: TableColumnOrderSetting[],
) {
  const columnSettingIndexByKey = new Map(
    columnSettings.map(({ key }, index) => [key, index]),
  );
  return columns.map(
    column => columnSettingIndexByKey.get(getColumnKey(column)) ?? -1,
  );
}
