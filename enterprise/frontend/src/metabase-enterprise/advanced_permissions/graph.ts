import _ from "underscore";

import type { EntityId } from "metabase/admin/permissions/types";
import {
  DataPermission,
  DataPermissionValue,
} from "metabase/admin/permissions/types";
import { isTableEntityId } from "metabase/admin/permissions/utils/data-entity-id";
import {
  getEntityPermission,
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
  const createQueriesPermissions = getEntityPermission(
    permissions,
    groupId,
    entityId,
    DataPermission.CREATE_QUERIES,
  );

  return (
    (value === DataPermissionValue.SANDBOXED ||
      value === DataPermissionValue.BLOCKED) &&
    createQueriesPermissions === DataPermissionValue.QUERY_BUILDER_AND_NATIVE
  );
}

export function upgradeViewPermissionsIfNeeded(
  permissions: GroupsPermissions,
  groupId: number,
  entityId: EntityId,
  value: NativePermissions,
  database: Database,
) {
  const viewDataPermission = getEntityPermission(
    permissions,
    groupId,
    entityId,
    DataPermission.VIEW_DATA,
  );

  const isGrantingNativeQueryAccessWithoutProperViewAccess =
    value === DataPermissionValue.QUERY_BUILDER_AND_NATIVE &&
    viewDataPermission !== DataPermissionValue.UNRESTRICTED &&
    viewDataPermission !== DataPermissionValue.IMPERSONATED;

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
      entityId,
      DataPermissionValue.UNRESTRICTED,
      database,
      DataPermission.VIEW_DATA,
    );
  }

  return permissions;
}
