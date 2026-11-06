import type {
  CollectionId,
  DatabaseId,
  GroupId,
  TableId,
} from "metabase-types/api";

export function tableDataPermissions(
  databaseId: DatabaseId,
  schema: string | null,
  tableId: TableId,
) {
  return `/admin/permissions/data/database/${databaseId}/schema/${encodeURIComponent(schema ?? "")}/table/${tableId}`;
}

export const groupDataPermissions = (groupId: GroupId) =>
  `/admin/permissions/data/group/${groupId}`;

export const collectionPermissions = (collectionId: CollectionId) =>
  `/admin/permissions/collections/${collectionId}`;
