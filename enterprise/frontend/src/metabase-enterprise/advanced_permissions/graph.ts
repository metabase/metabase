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

// TODO: rename this as it's more about downgrading certain permissions...
// likely downgradeNativePermissionsIfNeeded should be a more generic function like
// downgradePermissionsIfNeeded which could downgrade any other permission in response to one changing
// -- with that, it seems like it could just be an array of predicates that if match call and update function

export function updateNativePermission(
  permissions: GroupsPermissions,
  groupId: number,
  entityId: DatabaseEntityId,
  value: NativePermissions,
  database: Database,
) {
  const schemasPermission = getSchemasPermission(
    permissions,
    groupId,
    { databaseId: entityId.databaseId },
    DataPermission.VIEW_DATA,
  );

  if (
    value === DataPermissionValue.QUERY_BUILDER_AND_NATIVE &&
    schemasPermission !== DataPermissionValue.IMPERSONATED
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
}
