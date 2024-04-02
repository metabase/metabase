import _ from "underscore";

import type { DatabaseEntityId } from "metabase/admin/permissions/types";
import {
  DataPermission,
  DataPermissionValue,
} from "metabase/admin/permissions/types";
import {
  getSchemasPermission,
  updateSchemasPermission,
} from "metabase/admin/permissions/utils/graph";
import type Database from "metabase-lib/v1/metadata/Database";
import type { GroupsPermissions, NativePermissions } from "metabase-types/api";

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
      false,
    );
  }

  return permissions;
}
