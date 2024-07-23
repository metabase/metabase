import type { DatasetColumn } from "metabase-types/api";

export const getColumnKey = (column: Pick<DatasetColumn, "name">) => {
  return JSON.stringify(["name", column.name]);
};
