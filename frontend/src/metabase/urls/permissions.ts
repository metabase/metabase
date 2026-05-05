import type { DatabaseId, TableId } from "metabase-types/api";

export function tableDataPermissions(
  databaseId: DatabaseId,
  schema: string | null,
  tableId: TableId,
) {
  return `/admin/permissions/data/database/${databaseId}/schema/${encodeURIComponent(schema ?? "")}/table/${tableId}`;
}
