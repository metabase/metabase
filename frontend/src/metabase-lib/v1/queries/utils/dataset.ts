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
  name,
  fieldRef,
}: TableColumnOrderSetting) {
  return getColumnKey({ name, field_ref: normalize(fieldRef) }, true);
}

export function findColumnIndexesForColumnSettings(
  columns: DatasetColumn[],
  columnSettings: TableColumnOrderSetting[],
) {
  // for legacy settings without `desired_column_alias`, use the previous way
  // of matching columns by `name` and `field_ref`
  if (
    !columnSettings.every(columnSetting => columnSetting.desired_column_alias)
  ) {
    const columnIndexByKey = new Map(
      columns.map((column, index) => [getColumnKey(column, true), index]),
    );
    return columnSettings.map(
      columnSetting =>
        columnIndexByKey.get(getColumnSettingKey(columnSetting)) ?? -1,
    );
  }

  const columnIndexByAlias = new Map(
    columns.map((column, index) => [column.desired_column_alias, index]),
  );
  return columnSettings.map(
    columnSetting =>
      columnIndexByAlias.get(columnSetting.desired_column_alias ?? "") ?? -1,
  );
}

export function findColumnSettingIndexesForColumns(
  columns: DatasetColumn[],
  columnSettings: TableColumnOrderSetting[],
) {
  // for legacy settings without `desired_column_alias`, use the previous way
  // of matching columns by `name` and `field_ref`
  if (
    !columnSettings.every(columnSetting => columnSetting.desired_column_alias)
  ) {
    const columnSettingIndexByKey = new Map(
      columnSettings.map((columnSetting, index) => [
        getColumnSettingKey(columnSetting),
        index,
      ]),
    );
    return columns.map(
      column => columnSettingIndexByKey.get(getColumnKey(column, true)) ?? -1,
    );
  }

  const columnSettingIndexByAlias = new Map(
    columnSettings.map((columnSetting, index) => [
      columnSetting.desired_column_alias,
      index,
    ]),
  );
  return columns.map(
    column => columnSettingIndexByAlias.get(column.desired_column_alias) ?? -1,
  );
}
