import {
  DataPermission,
  DatabaseEntityId,
  DataPermissionValue,
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
    DataPermission.VIEW_DATA,
  );

  if (
    (value === DataPermissionValue.QUERY_BUILDER_AND_NATIVE ||
      value === DataPermissionValue.QUERY_BUILDER) &&
    schemasPermission !== DataPermissionValue.IMPERSONATED
  ) {
    permissions = updateSchemasPermission(
      permissions,
      groupId,
      { databaseId: entityId.databaseId },
      DataPermissionValue.UNRESTRICTED,
      database,
      DataPermission.VIEW_DATA,
      false,
    );
  }
  return updatePermission(
    permissions,
    groupId,
    entityId.databaseId,
    permission,
    [],
    value,
  );
}
