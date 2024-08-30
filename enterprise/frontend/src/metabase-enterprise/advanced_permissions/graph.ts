import _ from "underscore";

import type { EntityId } from "metabase/admin/permissions/types";
import {
  DataPermission,
  DataPermissionValue,
} from "metabase/admin/permissions/types";
import {
  isSchemaEntityId,
  isTableEntityId,
} from "metabase/admin/permissions/utils/data-entity-id";
import {
  getEntityPermission,
  getSchemasPermission,
  hasPermissionValueInSubgraph,
  updateEntityPermission,
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
  entityId: EntityId,
  value: NativePermissions,
  database: Database,
) {
  // get permission for item up one level or db if we're already at the top most entity:
  // table -> schema, schema -> database, database -> database
  const parentOrDbEntityId = isTableEntityId(entityId)
    ? _.pick(entityId, ["databaseId", "schemaName"])
    : _.pick(entityId, ["databaseId"]);

  const parentOrDbPermission = getEntityPermission(
    permissions,
    groupId,
    parentOrDbEntityId,
    DataPermission.VIEW_DATA,
  );

  const isGrantingNativeQueryAccessWithoutProperViewAccess =
    value === DataPermissionValue.QUERY_BUILDER_AND_NATIVE &&
    parentOrDbPermission !== DataPermissionValue.UNRESTRICTED &&
    parentOrDbPermission !== DataPermissionValue.IMPERSONATED;

  const isGrantingQueryAccessWithBlockedChild =
    value !== DataPermissionValue.NO &&
    !isTableEntityId(entityId) &&
    hasPermissionValueInSubgraph(
      permissions,
      groupId,
      entityId,
      database,
      DataPermission.VIEW_DATA,
      DataPermissionValue.BLOCKED,
    );

  if (
    isGrantingNativeQueryAccessWithoutProperViewAccess ||
    isGrantingQueryAccessWithBlockedChild
  ) {
    permissions = updateEntityPermission(
      permissions,
      groupId,
      parentOrDbEntityId,
      DataPermissionValue.UNRESTRICTED,
      database,
      DataPermission.VIEW_DATA,
    );
  }

  return permissions;
}
