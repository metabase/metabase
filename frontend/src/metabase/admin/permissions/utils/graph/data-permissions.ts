import { getIn, setIn } from "icepick";
import _ from "underscore";

import type Database from "metabase-lib/v1/metadata/Database";
import type Table from "metabase-lib/v1/metadata/Table";
import type { GroupsPermissions, ConcreteTableId } from "metabase-types/api";

import type {
  DatabaseEntityId,
  EntityId,
  SchemaEntityId,
  TableEntityId,
} from "../../types";
import { DataPermission, DataPermissionValue } from "../../types";

export const isRestrictivePermission = (value: string) =>
  value === "blocked" || value === "no";

// permission that do not have a nested shemas/native key
const flatPermissions = new Set(["details", "view-data", "create-queries"]);

// util to ease migration of perms attributes into a flatter structure
function getPermissionPath(
  groupId: number,
  databaseId: number,
  permission: DataPermission,
  nestedPath?: Array<string | number>,
) {
  const isFlatPermValue = flatPermissions.has(permission);
  if (isFlatPermValue) {
    return [groupId, databaseId, permission, ...(nestedPath || [])];
  }
  return [groupId, databaseId, permission, "schemas", ...(nestedPath || [])];
}

const elludedDefaultValues: Record<DataPermission, DataPermissionValue> = {
  [DataPermission.VIEW_DATA]: DataPermissionValue.BLOCKED,
  [DataPermission.CREATE_QUERIES]: DataPermissionValue.NO,
  [DataPermission.DOWNLOAD]: DataPermissionValue.NONE,
  [DataPermission.DATA_MODEL]: DataPermissionValue.NONE,
  [DataPermission.DETAILS]: DataPermissionValue.NO,
};

function getElludedPermissionValue(
  permission: DataPermission,
): DataPermissionValue {
  return elludedDefaultValues[permission] ?? DataPermissionValue.NO;
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
}: GetPermissionParams): DataPermissionValue => {
  const valuePath = getPermissionPath(groupId, databaseId, permission, path);
  const value = getIn(permissions, valuePath);
  if (isControlledType && typeof value === "object") {
    return DataPermissionValue.CONTROLLED;
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
): DataPermissionValue => {
  return getFieldsPermission(
    permissions,
    groupId,
    entityId,
    DataPermission.CREATE_QUERIES,
  );
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
  if (schemas === DataPermissionValue.CONTROLLED) {
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
): DataPermissionValue => {
  const tables = getTablesPermission(
    permissions,
    groupId,
    {
      databaseId,
      schemaName,
    },
    permission,
  );
  if (tables === DataPermissionValue.CONTROLLED) {
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
    return updateNativePermission(
      permissions,
      groupId,
      { databaseId },
      DataPermissionValue.NO,
    );
  } else if (
    value === DataPermissionValue.CONTROLLED &&
    // TODO: fix
    currentSchemas === "all" &&
    currentNative !== DataPermissionValue.NO
  ) {
    // if changing schemas to controlled, downgrade native to none
    return updateNativePermission(
      permissions,
      groupId,
      { databaseId },
      DataPermissionValue.NO,
    );
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
    // either "all" or "none"
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
    DataPermissionValue.CONTROLLED,
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
    DataPermissionValue.CONTROLLED,
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
  value: DataPermissionValue,
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

export function updateNativePermission(
  permissions: GroupsPermissions,
  groupId: number,
  entityId: DatabaseEntityId & TableEntityId,
  value: DataPermissionValue,
) {
  return updatePermission(
    permissions,
    groupId,
    entityId.databaseId,
    DataPermission.CREATE_QUERIES,
    _.compact([entityId.schemaName, entityId.tableId]),
    value,
  );
}
