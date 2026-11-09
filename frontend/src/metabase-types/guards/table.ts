import type {
  NormalizedField,
  NormalizedRealTable,
  NormalizedRealTableField,
  NormalizedTable,
} from "metabase-types/api";

export function isRealTable(
  table: NormalizedTable,
): table is NormalizedRealTable {
  return typeof table.id === "number";
}

export function isRealTableField(
  field: NormalizedField,
): field is NormalizedRealTableField {
  return typeof field.table_id === "number";
}
