import { getIn, setIn } from "icepick";
import _ from "underscore";

import {
  PLUGIN_ADMIN_PERMISSIONS_TABLE_FIELDS_PERMISSION_VALUE,
  PLUGIN_ADVANCED_PERMISSIONS,
} from "metabase/plugins";
import { GroupsPermissions } from "metabase-types/api";
import Database from "metabase-lib/lib/metadata/Database";
import Table from "metabase-lib/lib/metadata/Table";
import {
  DatabaseEntityId,
  DataPermission,
  EntityId,
  SchemaEntityId,
  TableEntityId,
} from "../../types";

export const isRestrictivePermission = (value: string) =>
  PLUGIN_ADVANCED_PERMISSIONS.isBlockPermission(value) || value === "none";

export function getPermission(
  permissions: GroupsPermissions,
  groupId: number,
  path: Array<number | string>,
  isControlledType = false,
) {
  const value = getIn(permissions, [groupId, ...path]);
  if (isControlledType) {
    if (!value) {
      return "none";
    } else if (typeof value === "object") {
      return "controlled";
    } else {
      return value;
    }
  } else if (value) {
    return value;
  } else {
    return "none";
  }
}

export function updatePermission(
  permissions: GroupsPermissions,
  groupId: number,
  path: Array<number | string>,
  value: string | number,
  entityIds?: any[],
) {
  const fullPath = [groupId, ...path];
  const current = getIn(permissions, fullPath);
  if (
    current === value ||
    (current && typeof current === "object" && value === "controlled")
  ) {
    return permissions;
  }
  let newValue: any;
  if (value === "controlled") {
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

export const getSchemasPermission = (
  permissions: GroupsPermissions,
  groupId: number,
  { databaseId }: DatabaseEntityId,
  permission: DataPermission,
) => {
  return getPermission(
    permissions,
    groupId,
    [databaseId, permission, "schemas"],
    true,
  );
};

export const getNativePermission = (
  permissions: GroupsPermissions,
  groupId: number,
  { databaseId }: DatabaseEntityId,
) => {
  return getPermission(permissions, groupId, [databaseId, "data", "native"]);
};

export const getTablesPermission = (
  permissions: GroupsPermissions,
  groupId: number,
  { databaseId, schemaName }: SchemaEntityId,
  permission: DataPermission,
) => {
  const schemas = getSchemasPermission(
    permissions,
    groupId,
    {
      databaseId,
    },
    permission,
  );
  if (schemas === "controlled") {
    return getPermission(
      permissions,
      groupId,
      [databaseId, permission, "schemas", schemaName || ""],
      true,
    );
  } else {
    return schemas;
  }
};

export const getFieldsPermission = (
  permissions: GroupsPermissions,
  groupId: number,
  { databaseId, schemaName, tableId }: TableEntityId,
  permission: DataPermission,
) => {
  const tables = getTablesPermission(
    permissions,
    groupId,
    {
      databaseId,
      schemaName,
    },
    permission,
  );
  if (tables === "controlled") {
    return getPermission(
      permissions,
      groupId,
      [databaseId, permission, "schemas", schemaName ?? "", tableId],
      true,
    );
  } else {
    return tables;
  }
};

export function downgradeNativePermissionsIfNeeded(
  permissions: GroupsPermissions,
  groupId: number,
  { databaseId }: DatabaseEntityId,
  value: any,
  database: Database,
  permission: DataPermission,
) {
  const currentSchemas = getSchemasPermission(
    permissions,
    groupId,
    {
      databaseId,
    },
    permission,
  );
  const currentNative = getNativePermission(permissions, groupId, {
    databaseId,
  });

  if (isRestrictivePermission(value)) {
    // if changing schemas to none, downgrade native to none
    return updateNativePermission(
      permissions,
      groupId,
      { databaseId },
      "none",
      database,
      permission,
    );
  } else if (
    value === "controlled" &&
    currentSchemas === "all" &&
    currentNative === "write"
  ) {
    // if changing schemas to controlled, downgrade native to none
    return updateNativePermission(
      permissions,
      groupId,
      { databaseId },
      "none",
      database,
      permission,
    );
  } else {
    return permissions;
  }
}

const metadataTableToTableEntityId = (table: Table) => ({
  databaseId: table.db_id,
  schemaName: table.schema_name || "",
  tableId: table.id,
});

// TODO Atte Keinänen 6/24/17 See if this method could be simplified
const entityIdToMetadataTableFields = (entityId: Partial<TableEntityId>) => ({
  ...(entityId.databaseId ? { db_id: entityId.databaseId } : {}),
  // Because schema name can be an empty string, which means an empty schema, this check becomes a little nasty
  ...(entityId.schemaName !== undefined
    ? { schema_name: entityId.schemaName !== "" ? entityId.schemaName : null }
    : {}),
  ...(entityId.tableId ? { id: entityId.tableId } : {}),
});

function inferEntityPermissionValueFromChildTables(
  permissions: GroupsPermissions,
  groupId: number,
  entityId: EntityId,
  database: Database,
  permission: DataPermission,
) {
  const entityIdsForDescendantTables = _.chain(database.tables)
    .filter(t => _.isMatch(t, entityIdToMetadataTableFields(entityId)))
    .map(metadataTableToTableEntityId)
    .value();

  const entityIdsByPermValue = _.chain(entityIdsForDescendantTables)
    .map(id => getFieldsPermission(permissions, groupId, id, permission))
    .groupBy(_.identity)
    .value();

  const keys = Object.keys(entityIdsByPermValue);
  const allTablesHaveSamePermissions = keys.length === 1;

  if (allTablesHaveSamePermissions) {
    // either "all" or "none"
    return keys[0];
  } else {
    return "controlled";
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
    permissions = downgradeNativePermissionsIfNeeded(
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
    "controlled",
    database,
    permission,
  );
  permissions = updatePermission(
    permissions,
    groupId,
    [databaseId, permission, "schemas", schemaName, tableId],
    ((PLUGIN_ADMIN_PERMISSIONS_TABLE_FIELDS_PERMISSION_VALUE as any)[
      value
    ] as any) || value,
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
  const tableIds = schema?.tables.map((t: Table) => t.id);

  permissions = updateSchemasPermission(
    permissions,
    groupId,
    { databaseId },
    "controlled",
    database,
    permission,
  );
  permissions = updatePermission(
    permissions,
    groupId,
    [databaseId, permission, "schemas", schemaName || ""],
    value,
    tableIds,
  );

  return permissions;
}

export function updateSchemasPermission(
  permissions: GroupsPermissions,
  groupId: number,
  { databaseId }: DatabaseEntityId,
  value: any,
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

  permissions = downgradeNativePermissionsIfNeeded(
    permissions,
    groupId,
    { databaseId },
    value,
    database,
    permission,
  );
  return updatePermission(
    permissions,
    groupId,
    [databaseId, permission, "schemas"],
    value,
    schemaNamesOrNoSchema,
  );
}

export function updateNativePermission(
  permissions: GroupsPermissions,
  groupId: number,
  { databaseId }: DatabaseEntityId,
  value: any,
  database: Database,
  permission: DataPermission,
) {
  // if enabling native query write access, give access to all schemas since they are equivalent
  if (value === "write") {
    permissions = updateSchemasPermission(
      permissions,
      groupId,
      { databaseId },
      "all",
      database,
      permission,
    );
  }
  return updatePermission(
    permissions,
    groupId,
    [databaseId, permission, "native"],
    value,
  );
}
