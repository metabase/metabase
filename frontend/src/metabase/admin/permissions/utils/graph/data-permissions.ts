import { getIn, setIn } from "icepick";
import _ from "underscore";

import type Database from "metabase-lib/v1/metadata/Database";
import type Table from "metabase-lib/v1/metadata/Table";
import type { GroupsPermissions, ConcreteTableId } from "metabase-types/api";

import type {
  DatabaseEntityId,
  DataPermission,
  EntityId,
  SchemaEntityId,
  TableEntityId,
} from "../../types";

export const isRestrictivePermission = (value: string) =>
  value === "blocked" || value === "no";

// util to ease migration of perms attributes into a flatter structure
function getPermissionPath(
  groupId: number,
  databaseId: number,
  permission: DataPermission,
  nestedPath?: Array<string | number>,
) {
  const isFlatPermValue = ["view-data", "create-queries"].includes(permission);
  if (isFlatPermValue) {
    return [groupId, databaseId, permission, ...(nestedPath || [])];
  }
  return [groupId, databaseId, permission, "schemas", ...(nestedPath || [])];
}

// TODO: add better typing Record<DataPermission, string | undefined>
const elludedDefaultValues: Record<string, string | undefined> = {
  "view-data": "blocked",
  "create-queries": "no",
};

function getElludedPermissionValue(permission: DataPermission) {
  return elludedDefaultValues[permission] ?? "none";
}

interface GetPermissionParams {
  permissions: GroupsPermissions;
  groupId: number;
  databaseId: number;
  permission: DataPermission; // TODO: add better typing
  path?: Array<number | string>;
  isControlledType?: boolean;
}

const getPermission = ({
  permissions,
  groupId,
  databaseId,
  permission,
  path,
  isControlledType = false,
}: GetPermissionParams) => {
  const valuePath = getPermissionPath(groupId, databaseId, permission, path);
  const value = getIn(permissions, valuePath);
  if (isControlledType && typeof value === "object") {
    return "controlled";
  }
  return value ? value : getElludedPermissionValue(permission);
};

export function updatePermission(
  permissions: GroupsPermissions,
  groupId: number,
  databaseId: number,
  permission: DataPermission, // TODO: add better typing
  path: Array<number | string>,
  value: string | undefined,
  entityIds?: any[],
) {
  const fullPath = getPermissionPath(groupId, databaseId, permission, path);
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
  return getPermission({
    permissions,
    databaseId,
    groupId,
    permission,
    isControlledType: true,
  });
};

export const getNativePermission = (
  permissions: GroupsPermissions,
  groupId: number,
  entityId: any, // TODO: fix
) => {
  return getFieldsPermission(permissions, groupId, entityId, "create-queries");
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
    return getPermission({
      permissions,
      databaseId,
      groupId,
      permission,
      path: _.compact([schemaName]),
      isControlledType: true,
    });
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
    return getPermission({
      permissions,
      groupId,
      databaseId,
      permission,
      path: _.compact([schemaName, tableId]),
      isControlledType: true,
    });
  } else {
    return tables;
  }
};

export function downgradeNativePermissionsIfNeeded(
  permissions: GroupsPermissions,
  groupId: number,
  { databaseId }: DatabaseEntityId,
  value: any,
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
    return updateNativePermission(permissions, groupId, { databaseId }, "no");
  } else if (
    value === "controlled" &&
    currentSchemas === "all" &&
    currentNative !== "no"
  ) {
    // if changing schemas to controlled, downgrade native to none
    return updateNativePermission(permissions, groupId, { databaseId }, "no");
  } else {
    return permissions;
  }
}

const metadataTableToTableEntityId = (table: Table) => ({
  databaseId: table.db_id,
  schemaName: table.schema_name || "",
  tableId: table.id as ConcreteTableId,
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
  downgradeNative?: boolean,
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
      downgradeNative,
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
      downgradeNative,
    );

    if (downgradeNative) {
      permissions = downgradeNativePermissionsIfNeeded(
        permissions,
        groupId,
        { databaseId },
        schemasPermissionValue,
        permission,
      );
    }
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
  downgradeNative?: boolean,
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
    downgradeNative,
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
  downgradeNative?: boolean,
) {
  const schema = database.schema(schemaName);
  const tableIds = schema?.getTables().map((t: Table) => t.id);

  permissions = updateSchemasPermission(
    permissions,
    groupId,
    { databaseId },
    "controlled",
    database,
    permission,
    downgradeNative,
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
  value: any,
  database: Database,
  permission: DataPermission,
  downgradeNative?: boolean,
) {
  const schemaNames = database && database.schemaNames();
  const schemaNamesOrNoSchema =
    schemaNames &&
    schemaNames.length > 0 &&
    !(schemaNames.length === 1 && schemaNames[0] === null)
      ? schemaNames
      : [""];

  if (downgradeNative) {
    permissions = downgradeNativePermissionsIfNeeded(
      permissions,
      groupId,
      { databaseId },
      value,
      permission,
    );
  }

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

// TODO: refactor
export function updateNativePermission(
  permissions: GroupsPermissions,
  groupId: number,
  { databaseId }: DatabaseEntityId,
  value: any,
) {
  return updatePermission(
    permissions,
    groupId,
    databaseId,
    "create-queries",
    [],
    value,
  );
}
