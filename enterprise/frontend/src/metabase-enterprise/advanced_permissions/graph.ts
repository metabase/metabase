import _ from "underscore";

import type {
  DatabaseEntityId,
  EntityId,
} from "metabase/admin/permissions/types";
import {
  DataPermission,
  DataPermissionValue,
} from "metabase/admin/permissions/types";
import {
  isTableEntityId,
  isSchemaEntityId,
} from "metabase/admin/permissions/utils/data-entity-id";
import {
  getSchemasPermission,
  updateSchemasPermission,
} from "metabase/admin/permissions/utils/graph";
import type Database from "metabase-lib/v1/metadata/Database";
import type { GroupsPermissions, NativePermissions } from "metabase-types/api";

export function shouldRestrictNativeQueryPermissions(
  permissions: GroupsPermissions,
  groupId: number,
  entityId: EntityId,
  _permission: DataPermission,
  value: DataPermissionValue,
  _database: Database,
) {
  const currDbNativePermission = getSchemasPermission(
    permissions,
    groupId,
    { databaseId: entityId.databaseId },
    DataPermission.CREATE_QUERIES,
  );

  if (isTableEntityId(entityId)) {
    return (
      (value === DataPermissionValue.SANDBOXED ||
        value === DataPermissionValue.BLOCKED) &&
      currDbNativePermission === DataPermissionValue.QUERY_BUILDER_AND_NATIVE
    );
  }

  if (isSchemaEntityId(entityId)) {
    return (
      value === DataPermissionValue.BLOCKED &&
      currDbNativePermission === DataPermissionValue.QUERY_BUILDER_AND_NATIVE
    );
  }

  return false;
}

export function upgradeViewPermissionsIfNeeded(
  permissions: GroupsPermissions,
  groupId: number,
  entityId: DatabaseEntityId,
  value: NativePermissions,
  database: Database,
) {
  const dbPermission = getSchemasPermission(
    permissions,
    groupId,
    { databaseId: entityId.databaseId },
    DataPermission.VIEW_DATA,
  );

  if (
    value === DataPermissionValue.QUERY_BUILDER_AND_NATIVE &&
    dbPermission !== DataPermissionValue.IMPERSONATED
  ) {
    permissions = updateSchemasPermission(
      permissions,
      groupId,
      entityId,
      DataPermissionValue.UNRESTRICTED,
      database,
      DataPermission.VIEW_DATA,
    );
  }

  return permissions;
}
