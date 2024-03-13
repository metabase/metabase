import { getColumnKey } from "metabase-lib/v1/queries/utils/get-column-key";
import { normalize } from "metabase-lib/v1/queries/utils/normalize";
import type {
  DatasetColumn,
  DatasetData,
  TableColumnOrderSetting,
} from "metabase-types/api";

export const datasetContainsNoResults = (data: DatasetData) =>
  data.rows == null || data.rows.length === 0;

export function getColumnSettingKey({
  key,
  name,
  fieldRef,
}: TableColumnOrderSetting) {
  return key ?? getColumnKey({ name, field_ref: normalize(fieldRef) });
}

export function findColumnIndexesForColumnSettings(
  columns: DatasetColumn[],
  columnSettings: TableColumnOrderSetting[],
) {
  const columnIndexByKey = new Map(
    columns.map((column, index) => [getColumnKey(column), index]),
  );
  return columnSettings.map(
    columnSetting =>
      columnIndexByKey.get(getColumnSettingKey(columnSetting)) ?? -1,
  );
}

export function findColumnSettingIndexesForColumns(
  columns: DatasetColumn[],
  columnSettings: TableColumnOrderSetting[],
) {
  const columnSettingIndexByKey = new Map(
    columnSettings.map((columnSetting, index) => [
      getColumnSettingKey(columnSetting),
      index,
    ]),
  );
  return columns.map(
    column => columnSettingIndexByKey.get(getColumnKey(column)) ?? -1,
  );
}
