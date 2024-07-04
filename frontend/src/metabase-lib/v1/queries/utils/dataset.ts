import { getColumnKey } from "metabase-lib/v1/queries/utils/get-column-key";
import { normalize } from "metabase-lib/v1/queries/utils/normalize";
import type {
  DatasetColumn,
  DatasetData,
  TableColumnOrderSetting,
} from "metabase-types/api";

export const datasetContainsNoResults = (data: DatasetData) =>
  data.rows == null || data.rows.length === 0;

export function getColumnSettingKey(
  { key, name, fieldRef }: TableColumnOrderSetting,
  ignoreBaseType = false,
) {
  if (ignoreBaseType) {
    return getColumnKey({ name, field_ref: normalize(fieldRef) }, true);
  }

  return key ?? getColumnKey({ name, field_ref: normalize(fieldRef) });
}

export function findColumnIndexesForColumnSettings(
  columns: DatasetColumn[],
  columnSettings: TableColumnOrderSetting[],
) {
  const indexesByKey = new Map<string, number[]>();
  columns.forEach((column, index) => {
    const key = getColumnKey(column, true);
    const indexes = indexesByKey.get(key) ?? [];
    indexesByKey.set(key, [...indexes, index]);
  });
  return columnSettings.map(columnSetting => {
    const key = getColumnSettingKey(columnSetting, true);
    const indexes = indexesByKey.get(key);
    if (!indexes) {
      return -1;
    }
    return (
      indexes.find(index => columns[index].name === columnSetting.name) ??
      indexes[0]
    );
  });
}

export function findColumnSettingIndexesForColumns(
  columns: DatasetColumn[],
  columnSettings: TableColumnOrderSetting[],
) {
  const indexesByKey = new Map<string, number[]>();
  columnSettings.forEach((columnSetting, index) => {
    const key = getColumnSettingKey(columnSetting, true);
    const indexes = indexesByKey.get(key) ?? [];
    indexesByKey.set(key, [...indexes, index]);
  });
  return columns.map(column => {
    const key = getColumnKey(column, true);
    const indexes = indexesByKey.get(key);
    if (!indexes) {
      return -1;
    }
    return (
      indexes.find(index => columnSettings[index].name === column.name) ??
      indexes[0]
    );
  });
}
