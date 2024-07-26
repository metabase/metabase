import type { DatasetColumn } from "metabase-types/api";

export function getColumnKey(column: Pick<DatasetColumn, "name">): string {
  return JSON.stringify(["name", column.name]);
}

export function getColumnNameFromKey(key: string): string | undefined {
  const [type, name] = JSON.parse(key);
  return type === "name" ? name : undefined;
}
