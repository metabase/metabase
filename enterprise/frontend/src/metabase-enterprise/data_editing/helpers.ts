import type { DatasetColumn } from "metabase-types/api";

export function canEditColumn(column: DatasetColumn) {
  return column.semantic_type !== "type/PK";
}
