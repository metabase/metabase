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
  columns: Pick<DatasetColumn, "name" | "field_ref">[],
  columnSettings: TableColumnOrderSetting[],
) {
  const columnIndexByKey = new Map(
    columns.map((column, index) => [getColumnKey(column, true), index]),
  );
  return columnSettings.map(
    columnSetting =>
      columnIndexByKey.get(getColumnSettingKey(columnSetting, true)) ?? -1,
  );
}

export function findColumnSettingIndexesForColumns(
  columns: Pick<DatasetColumn, "name" | "field_ref">[],
  columnSettings: TableColumnOrderSetting[],
) {
  const columnSettingIndexByKey = new Map(
    columnSettings.map((columnSetting, index) => [
      getColumnSettingKey(columnSetting, true),
      index,
    ]),
  );
  return columns.map(
    column => columnSettingIndexByKey.get(getColumnKey(column, true)) ?? -1,
  );
}
