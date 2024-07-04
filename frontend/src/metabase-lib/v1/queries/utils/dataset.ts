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

  // Column keys are computed based on field refs and can "survive" certain
  // query updates where the column name normally changes. E.g. when there are
  // multiple implicitly joinable fields added with the same name, they would
  // have names like `ID`, `ID_2`, `ID_3`, and removing `ID_2` from the query
  // will cause `ID_3` to become `ID_2`; but the key won't change. That's why
  // column keys take priority over name matches.
  const matchedIndexes = Array(columns2.length).fill(-1);
  columns2.forEach((column, index) => {
    const key = getColumn2Key(column);
    const indexByKey = indexesByKey.get(key) ?? [];
    if (indexByKey.length === 1) {
      matchedIndexes[index] = indexByKey[0];
    }
  });

  // In some cases matching by keys will fail. Self joins with duplicate columns
  // will have the same column key but different column names. Also adding a
  // query stage can cause the QP to switch from integer-based to string-based
  // field refs, making all column keys different. For these cases we match by
  // column name as a last resort.
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
