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
  columns: Pick<DatasetColumn, "name" | "field_ref">[],
  columnSettings: TableColumnOrderSetting[],
) {
  const columnIndexByName = new Map(
    columns.map((column, index) => [column.name, index]),
  );
  return columnSettings.map(
    columnSetting => columnIndexByName.get(columnSetting.name) ?? -1,
  );
}

export function findColumnSettingIndexesForColumns(
  columns: Pick<DatasetColumn, "name" | "field_ref">[],
  columnSettings: TableColumnOrderSetting[],
) {
  const columnSettingIndexByKey = new Map(
    columnSettings.map((columnSetting, index) => [columnSetting.name, index]),
  );
  return columns.map(column => columnSettingIndexByKey.get(column.name) ?? -1);
}
