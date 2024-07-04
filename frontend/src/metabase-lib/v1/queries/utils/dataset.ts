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

function findIndexes<T1, T2>(
  items1: T1[],
  items2: T2[],
  getItem1Key: (item: T1) => string,
  getItem1Name: (item: T1) => string,
  getItem2Key: (item: T2) => string,
  getItem2Name: (item: T2) => string,
) {
  const indexesByKey = new Map<string, number[]>();
  const indexesByName = new Map<string, number>();
  items1.forEach((item, index) => {
    const key = getItem1Key(item);
    const indexes = indexesByKey.get(key) ?? [];
    indexesByKey.set(key, [...indexes, index]);
    indexesByName.set(getItem1Name(item), index);
  });

  // Keys take priority over names
  // There could be cases where the name has changed but the key has not
  // Ignore duplicate key matches
  const matchedIndexes = Array(items2.length).fill(-1);
  items2.forEach((item, index) => {
    const key = getItem2Key(item);
    const indexByKey = indexesByKey.get(key) ?? [];
    if (indexByKey.length === 1) {
      matchedIndexes[index] = indexByKey[0];
    }
  });

  // Set missing index by name
  // Do not overwrite previous matches by key
  // Do not use the same index more than once
  const unavailableIndexes = new Set(matchedIndexes);
  items2.forEach((item, index) => {
    if (matchedIndexes[index] < 0) {
      const name = getItem2Name(item);
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
  return findIndexes(
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
  return findIndexes(
    columnSettings,
    columns,
    columnSetting => getColumnSettingKey(columnSetting, true),
    columnSetting => columnSetting.name,
    column => getColumnKey(column, true),
    column => column.name,
  );
}
