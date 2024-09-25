import _ from "underscore";

import { PLUGIN_ADVANCED_PERMISSIONS } from "metabase/plugins";
import type Database from "metabase-lib/v1/metadata/Database";
import type { GroupsPermissions } from "metabase-types/api/permissions";

import {
  DataPermission,
  DataPermissionValue,
  type EntityId,
} from "../../../types";
import {
  getSchemasPermission,
  updateTablesPermission,
} from "../../../utils/graph";

export const isRestrictivePermission = (value: DataPermissionValue) =>
  value === DataPermissionValue.NO ||
  PLUGIN_ADVANCED_PERMISSIONS.isRestrictivePermission(value);

// Function is used to power PLUGIN_DATA_PERMISSIONS.shouldRestrictNativeQueryPermissions, but the fn is defined here for two reasons:
// - including in ./update.ts will cause a circular dependency between it and the plugin definition file
// - enterprise edition overwrites the plugin's method, so it's maybe better thought of as a black box
export function defaultShouldRestrictNativeQueryPermissionsFn(
  permissions: GroupsPermissions,
  groupId: number,
  entityId: EntityId,
  permission: DataPermission,
  value: DataPermissionValue,
  _database: Database,
): boolean {
  const currDbCreateQueriesPermission = getSchemasPermission(
    permissions,
    groupId,
    { databaseId: entityId.databaseId },
    DataPermission.CREATE_QUERIES,
  );

  return (
    permission === DataPermission.CREATE_QUERIES &&
    value !== DataPermissionValue.QUERY_BUILDER_AND_NATIVE &&
    (entityId.tableId != null || entityId.schemaName != null) &&
    currDbCreateQueriesPermission ===
      DataPermissionValue.QUERY_BUILDER_AND_NATIVE
  );
}

// Function is used to power PLUGIN_DATA_PERMISSIONS.restrictNativePermissions, but the fn is defined here for two reasons:
// - including in ./update.ts will cause a circular dependency between it and the plugin definition file
// - enterprise edition overwrites the plugin's method, so it's maybe better thought of as a black box
export function defaultRestrictNativePermissionsFn(
  permissions: GroupsPermissions,
  groupId: number,
  entityId: EntityId,
  database: Database,
): GroupsPermissions {
  const schemaNames = (database && database.schemaNames()) ?? [null];

  schemaNames.forEach(schemaName => {
    permissions = updateTablesPermission(
      permissions,
      groupId,
      {
        databaseId: entityId.databaseId,
        schemaName,
      },
      DataPermissionValue.QUERY_BUILDER,
      database,
      DataPermission.CREATE_QUERIES,
    );
  });

  return permissions;
}
