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

function findColumnIndexes<T1, T2>(
  columns1: T1[],
  columns2: T2[],
  getColumn1Key: (item: T1) => string,
  getColumn1Name: (item: T1) => string,
  getColumn2Key: (item: T2) => string,
  getColumn2Name: (item: T2) => string,
) {
  const indexesByKey = new Map<string, number[]>();
  const indexesByName = new Map<string, number>();
  columns1.forEach((column, index) => {
    const key = getColumn1Key(column);
    const indexes = indexesByKey.get(key) ?? [];
    indexesByKey.set(key, [...indexes, index]);
    indexesByName.set(getColumn1Name(column), index);
  });

  // Keys take priority over names
  // There could be cases where the name has changed but the key has not
  // Ignore duplicate key matches
  const matchedIndexes = Array(columns2.length).fill(-1);
  columns2.forEach((column, index) => {
    const key = getColumn2Key(column);
    const indexByKey = indexesByKey.get(key) ?? [];
    if (indexByKey.length === 1) {
      matchedIndexes[index] = indexByKey[0];
    }
  });

  // Set missing index by name
  // Do not overwrite previous matches by key
  // Do not use the same index more than once
  const unavailableIndexes = new Set(matchedIndexes);
  columns2.forEach((column, index) => {
    if (matchedIndexes[index] < 0) {
      const name = getColumn2Name(column);
      const indexByName = indexesByName.get(name);
      if (indexByName != null && !unavailableIndexes.has(indexByName)) {
        matchedIndexes[index] = indexByName;
      }
    }
  });

  return matchedIndexes;
}

export function findColumnIndexesForColumnSettings(
  columns: DatasetColumn[],
  columnSettings: TableColumnOrderSetting[],
) {
  return findColumnIndexes(
    columns,
    columnSettings,
    column => getColumnKey(column, true),
    column => column.name,
    columnSetting => getColumnSettingKey(columnSetting, true),
    columnSetting => columnSetting.name,
  );
}

export function findColumnSettingIndexesForColumns(
  columns: DatasetColumn[],
  columnSettings: TableColumnOrderSetting[],
) {
  return findColumnIndexes(
    columnSettings,
    columns,
    columnSetting => getColumnSettingKey(columnSetting, true),
    columnSetting => columnSetting.name,
    column => getColumnKey(column, true),
    column => column.name,
  );
}
