import { getIn, setIn } from "icepick";
import _ from "underscore";

import type {
  DatabaseEntityId,
  EntityId,
  SchemaEntityId,
  TableEntityId,
} from "metabase/admin/permissions/types";
import {
  DataPermission,
  DataPermissionValue,
} from "metabase/admin/permissions/types";
import {
  isSchemaEntityId,
  isTableEntityId,
} from "metabase/admin/permissions/utils/data-entity-id";
import {
  entityIdToMetadataTableFields,
  metadataTableToTableEntityId,
} from "metabase/admin/permissions/utils/metadata";
import { PLUGIN_DATA_PERMISSIONS } from "metabase/plugins";
import type Database from "metabase-lib/v1/metadata/Database";
import type Table from "metabase-lib/v1/metadata/Table";
import type { GroupsPermissions } from "metabase-types/api";

import { getFieldsPermission, getPermissionPath } from "./get";
import { isRestrictivePermission } from "./utils";

export function updatePermission(
  permissions: GroupsPermissions,
  groupId: number,
  databaseId: number,
  permission: DataPermission,
  path: Array<number | string>,
  value: string | undefined,
  entityIds?: any[],
) {
  const fullPath = getPermissionPath(groupId, databaseId, permission, path);
  const current = getIn(permissions, fullPath);

  if (
    current === value ||
    (current &&
      typeof current === "object" &&
      value === DataPermissionValue.CONTROLLED)
  ) {
    return permissions;
  }
  let newValue: any;
  if (value === DataPermissionValue.CONTROLLED) {
    newValue = {};
    if (entityIds) {
      for (const entityId of entityIds) {
        newValue[entityId] = current;
      }
    }
  } else {
    newValue = value;
  }
  for (let i = 0; i < fullPath.length; i++) {
    if (typeof getIn(permissions, fullPath.slice(0, i)) === "string") {
      permissions = setIn(permissions, fullPath.slice(0, i), {});
    }
  }
  return setIn(permissions, fullPath, newValue);
}

export function updateFieldsPermission(
  permissions: GroupsPermissions,
  groupId: number,
  entityId: TableEntityId,
  value: any,
  database: Database,
  permission: DataPermission,
) {
  const { databaseId, tableId } = entityId;
  const schemaName = entityId.schemaName || "";

  permissions = updateTablesPermission(
    permissions,
    groupId,
    { databaseId, schemaName },
    DataPermissionValue.CONTROLLED,
    database,
    permission,
  );
  permissions = updatePermission(
    permissions,
    groupId,
    databaseId,
    permission,
    [schemaName, tableId],
    value,
  );
  return permissions;
}

export function updateTablesPermission(
  permissions: GroupsPermissions,
  groupId: number,
  { databaseId, schemaName }: SchemaEntityId,
  value: any,
  database: Database,
  permission: DataPermission,
) {
  const schema = database.schema(schemaName);
  const tableIds = schema?.getTables().map((t: Table) => t.id);

  permissions = updateSchemasPermission(
    permissions,
    groupId,
    { databaseId },
    DataPermissionValue.CONTROLLED,
    database,
    permission,
  );
  permissions = updatePermission(
    permissions,
    groupId,
    databaseId,
    permission,
    [schemaName || ""],
    value,
    tableIds,
  );

  return permissions;
}

export function updateSchemasPermission(
  permissions: GroupsPermissions,
  groupId: number,
  { databaseId }: DatabaseEntityId,
  value: DataPermissionValue,
  database: Database,
  permission: DataPermission,
) {
  const schemaNames = database && database.schemaNames();
  const schemaNamesOrNoSchema =
    schemaNames &&
    schemaNames.length > 0 &&
    !(schemaNames.length === 1 && schemaNames[0] === null)
      ? schemaNames
      : [""];

  return updatePermission(
    permissions,
    groupId,
    databaseId,
    permission,
    [],
    value,
    schemaNamesOrNoSchema,
  );
}

export function updateEntityPermission(
  permissions: GroupsPermissions,
  groupId: number,
  entityId: EntityId,
  value: DataPermissionValue,
  database: Database,
  permission: DataPermission,
) {
  if (isTableEntityId(entityId)) {
    return updateFieldsPermission(
      permissions,
      groupId,
      entityId,
      value,
      database,
      permission,
    );
  } else if (isSchemaEntityId(entityId)) {
    return updateTablesPermission(
      permissions,
      groupId,
      entityId,
      value,
      database,
      permission,
    );
  } else {
    return updateSchemasPermission(
      permissions,
      groupId,
      entityId,
      value,
      database,
      permission,
    );
  }
}

export function restrictCreateQueriesPermissionsIfNeeded(
  permissions: GroupsPermissions,
  groupId: number,
  entityId: EntityId,
  permission: DataPermission,
  value: DataPermissionValue,
  database: Database,
) {
  const shouldRestrictNative =
    PLUGIN_DATA_PERMISSIONS.shouldRestrictNativeQueryPermissions(
      permissions,
      groupId,
      entityId,
      permission,
      value,
      database,
    );

  if (shouldRestrictNative) {
    permissions = updateEntityPermission(
      permissions,
      groupId,
      entityId,
      DataPermissionValue.QUERY_BUILDER,
      database,
      DataPermission.CREATE_QUERIES,
    );
  }

  if (
    isRestrictivePermission(value) ||
    value === DataPermissionValue.LEGACY_NO_SELF_SERVICE
  ) {
    permissions = updateEntityPermission(
      permissions,
      groupId,
      entityId,
      DataPermissionValue.NO,
      database,
      DataPermission.CREATE_QUERIES,
    );
  }

  return permissions;
}

function inferEntityPermissionValueFromChildTables(
  permissions: GroupsPermissions,
  groupId: number,
  entityId: EntityId,
  database: Database,
  permission: DataPermission,
): DataPermissionValue {
  const entityIdsForDescendantTables = _.chain(database.tables)
    .filter(t => _.isMatch(t, entityIdToMetadataTableFields(entityId)))
    .map(metadataTableToTableEntityId)
    .value();

  const entityIdsByPermValue = _.chain(entityIdsForDescendantTables)
    .map(id => getFieldsPermission(permissions, groupId, id, permission))
    .groupBy(_.identity)
    .value();

  const keys = Object.keys(entityIdsByPermValue) as DataPermissionValue[];
  const allTablesHaveSamePermissions = keys.length === 1;

  if (allTablesHaveSamePermissions) {
    return keys[0];
  } else {
    return DataPermissionValue.CONTROLLED;
  }
}

// Checks the child tables of a given entityId and updates the shared table and/or schema permission values according to table permissions
// This method was added for keeping the UI in sync when modifying child permissions
export function inferAndUpdateEntityPermissions(
  permissions: GroupsPermissions,
  groupId: number,
  entityId: EntityId,
  database: Database,
  permission: DataPermission,
) {
  const { databaseId } = entityId;
  const schemaName = (entityId as SchemaEntityId).schemaName ?? "";

  if (schemaName) {
    // Check all tables for current schema if their shared schema-level permission value should be updated
    const tablesPermissionValue = inferEntityPermissionValueFromChildTables(
      permissions,
      groupId,
      { databaseId, schemaName },
      database,
      permission,
    );
    permissions = updateTablesPermission(
      permissions,
      groupId,
      { databaseId, schemaName },
      tablesPermissionValue,
      database,
      permission,
    );
  }

  if (databaseId) {
    // Check all tables for current database if schemas' shared database-level permission value should be updated
    const schemasPermissionValue = inferEntityPermissionValueFromChildTables(
      permissions,
      groupId,
      { databaseId },
      database,
      permission,
    );
    permissions = updateSchemasPermission(
      permissions,
      groupId,
      { databaseId },
      schemasPermissionValue,
      database,
      permission,
    );
  }

  return permissions;
}
