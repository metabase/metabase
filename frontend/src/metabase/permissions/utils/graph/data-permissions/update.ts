import { groupBy } from "es-toolkit";

import { PLUGIN_DATA_PERMISSIONS } from "metabase/plugins";
import { getByPath, produce } from "metabase/utils/immutable";
import {
  DataPermission,
  DataPermissionValue,
  type DatabaseEntityId,
  type GroupsPermissions,
  type PermissionEntityId,
  type PermissionsDatabase,
  type SchemaEntityId,
  type TableEntityId,
} from "metabase-types/api";
import { isObject } from "metabase-types/guards";

import { isSchemaEntityId, isTableEntityId } from "../../data-entity-id";
import {
  getDatabaseSchema,
  getDatabaseSchemaNames,
  isTableUnderEntityId,
  tableToTableEntityId,
} from "../../metadata";

import {
  getFieldsPermission,
  getPermissionPath,
  getSchemasPermission,
} from "./get";
import { isRestrictivePermission } from "./utils";

export function updatePermission(
  permissions: GroupsPermissions,
  groupId: number,
  databaseId: number,
  permission: DataPermission,
  path: Array<number | string>,
  value: string | undefined,
  entityIds?: Array<string | number>,
) {
  const fullPath = getPermissionPath(groupId, databaseId, permission, path);
  const current = getByPath(permissions, fullPath);

  if (
    current === value ||
    (current &&
      typeof current === "object" &&
      value === DataPermissionValue.CONTROLLED)
  ) {
    return permissions;
  }
  let newValue: unknown;
  if (value === DataPermissionValue.CONTROLLED) {
    const controlledValue: Record<string | number, unknown> = {};
    if (entityIds) {
      for (const entityId of entityIds) {
        controlledValue[entityId] = current;
      }
    }
    newValue = controlledValue;
  } else {
    newValue = value;
  }
  return produce(permissions, (draft) => {
    setGraphValue(draft, fullPath, newValue);
  });
}

// Missing levels and string leaves on the way become objects, as the path goes deeper than them.
function setGraphValue(
  graph: Record<string | number, unknown>,
  path: Array<string | number>,
  value: unknown,
) {
  const [key, ...restPath] = path;
  if (restPath.length === 0) {
    graph[key] = value;
    return;
  }
  const child = graph[key];
  if (isObject(child)) {
    setGraphValue(child, restPath, value);
  } else {
    const newChild: Record<string | number, unknown> = {};
    graph[key] = newChild;
    setGraphValue(newChild, restPath, value);
  }
}

export function updateFieldsPermission(
  permissions: GroupsPermissions,
  groupId: number,
  entityId: TableEntityId,
  value: any,
  database: PermissionsDatabase,
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
  database: PermissionsDatabase,
  permission: DataPermission,
) {
  const schema = getDatabaseSchema(database, schemaName);
  const tableIds = schema?.tables.map((table) => table.id);

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
  database: PermissionsDatabase,
  permission: DataPermission,
) {
  const schemaNames = getDatabaseSchemaNames(database);
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
  entityId: PermissionEntityId,
  value: DataPermissionValue,
  database: PermissionsDatabase,
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
  entityId: PermissionEntityId,
  permission: DataPermission,
  value: DataPermissionValue,
  database: PermissionsDatabase,
) {
  const currDbCreateQueriesPermission = getSchemasPermission(
    permissions,
    groupId,
    { databaseId: entityId.databaseId },
    DataPermission.CREATE_QUERIES,
  );

  const isMakingGranularCreateQueriesChange =
    permission === DataPermission.CREATE_QUERIES &&
    value !== DataPermissionValue.QUERY_BUILDER_AND_NATIVE &&
    (entityId.tableId != null || entityId.schemaName != null) &&
    currDbCreateQueriesPermission ===
      DataPermissionValue.QUERY_BUILDER_AND_NATIVE;

  const shouldRestrictForSomeReason =
    PLUGIN_DATA_PERMISSIONS.shouldRestrictNativeQueryPermissions(
      permissions,
      groupId,
      entityId,
      permission,
      value,
      database,
    );

  const shouldRestrictNative =
    isMakingGranularCreateQueriesChange || shouldRestrictForSomeReason;

  if (shouldRestrictNative) {
    const schemaNames = getDatabaseSchemaNames(database);

    schemaNames.forEach((schemaName) => {
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

const hasFullViewDataAccess = (viewDataValue: DataPermissionValue): boolean => {
  return viewDataValue === DataPermissionValue.UNRESTRICTED;
};

const hasFullCreateQueriesAccess = (
  createQueriesValue: DataPermissionValue,
): boolean => {
  return createQueriesValue === DataPermissionValue.QUERY_BUILDER_AND_NATIVE;
};

export function revokeTransformsPermissionIfNeeded(
  permissions: GroupsPermissions,
  groupId: number,
  entityId: PermissionEntityId,
  permission: DataPermission,
  value: DataPermissionValue,
): GroupsPermissions {
  if (
    permission !== DataPermission.VIEW_DATA &&
    permission !== DataPermission.CREATE_QUERIES
  ) {
    return permissions;
  }

  const { databaseId } = entityId;

  const viewDataValue =
    permission === DataPermission.VIEW_DATA
      ? value
      : getSchemasPermission(
          permissions,
          groupId,
          { databaseId },
          DataPermission.VIEW_DATA,
        );

  const createQueriesValue =
    permission === DataPermission.CREATE_QUERIES
      ? value
      : getSchemasPermission(
          permissions,
          groupId,
          { databaseId },
          DataPermission.CREATE_QUERIES,
        );

  const hasRequiredPermissions =
    hasFullViewDataAccess(viewDataValue) &&
    hasFullCreateQueriesAccess(createQueriesValue);

  if (!hasRequiredPermissions) {
    return updatePermission(
      permissions,
      groupId,
      databaseId,
      DataPermission.TRANSFORMS,
      [],
      DataPermissionValue.NO,
    );
  }

  return permissions;
}

function inferEntityPermissionValueFromChildTables(
  permissions: GroupsPermissions,
  groupId: number,
  entityId: PermissionEntityId,
  database: PermissionsDatabase,
  permission: DataPermission,
): DataPermissionValue {
  const entityIdsForDescendantTables = (database.tables ?? [])
    .filter((table) => isTableUnderEntityId(table, entityId))
    .map(tableToTableEntityId);

  const entityIdsByPermValue = groupBy(
    entityIdsForDescendantTables.map((id) =>
      getFieldsPermission(permissions, groupId, id, permission),
    ),
    (value) => value,
  );

  // Unjustified type cast. FIXME
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
  entityId: PermissionEntityId,
  database: PermissionsDatabase,
  permission: DataPermission,
) {
  const { databaseId } = entityId;
  // Unjustified type cast. FIXME
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
