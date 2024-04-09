import type {
  DataPermission,
  DatabaseEntityId,
} from "metabase/admin/permissions/types";
import {
  getSchemasPermission,
  updatePermission,
  updateSchemasPermission,
} from "metabase/admin/permissions/utils/graph";
import type Database from "metabase-lib/v1/metadata/Database";
import type { GroupsPermissions, NativePermissions } from "metabase-types/api";

export function updateNativePermission(
  permissions: GroupsPermissions,
  groupId: number,
  entityId: DatabaseEntityId,
  value: NativePermissions,
  database: Database,
  permission: DataPermission,
) {
  const schemasPermission = getSchemasPermission(
    permissions,
    groupId,
    entityId,
    permission,
  );

  if (value === "write" && schemasPermission !== "impersonated") {
    permissions = updateSchemasPermission(
      permissions,
      groupId,
      { databaseId: entityId.databaseId },
      "all",
      database,
      permission,
      false,
    );
  }
  return updatePermission(
    permissions,
    groupId,
    [entityId.databaseId, permission, "native"],
    value,
  );
}
