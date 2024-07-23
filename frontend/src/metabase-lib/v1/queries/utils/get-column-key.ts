import type { DatasetColumn } from "metabase-types/api";

export const getColumnKey = (
  column: Pick<DatasetColumn, "name" | "field_ref">,
) => {
  return ["name", column.name];
};
