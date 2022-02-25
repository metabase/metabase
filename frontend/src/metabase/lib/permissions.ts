import { getIn, setIn } from "icepick";
import _ from "underscore";

import {
  PLUGIN_ADMIN_PERMISSIONS_TABLE_FIELDS_PERMISSION_VALUE,
  PLUGIN_ADVANCED_PERMISSIONS,
} from "metabase/plugins";
import {
  DatabasePermissions,
  Group,
  GroupsPermissions,
} from "metabase-types/types/Permissions";
import { Metadata } from "metabase-types/types/Metadata";
import { Table } from "metabase-types/types/Table";
import { Database } from "metabase-types/types/Database";

export type DatabaseEntityId = {
  databaseId: number;
};

export type SchemaEntityId = DatabaseEntityId & {
  schemaName: string | undefined;
};

export type TableEntityId = SchemaEntityId & {
  tableId: number;
};

export type EntityId = DatabaseEntityId | SchemaEntityId | TableEntityId;

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
  permission: "data" | "download",
) => {
  return getPermission(
    permissions,
    groupId,
    [databaseId, permission, "schemas"],
    true,
  );
};

export const getSchemasDataPermission = (
  permissions: GroupsPermissions,
  groupId: number,
  entityId: DatabaseEntityId,
) => {
  return getSchemasPermission(permissions, groupId, entityId, "data");
};

export const getSchemasDownloadPermission = (
  permissions: GroupsPermissions,
  groupId: number,
  entityId: DatabaseEntityId,
) => {
  return getSchemasPermission(permissions, groupId, entityId, "download");
};

export const getNativePermission = (
  permissions: GroupsPermissions,
  groupId: number,
  { databaseId }: DatabaseEntityId,
) => {
  return getPermission(permissions, groupId, [databaseId, "data", "native"]);
};

export const getDownloadSchemasPermission = (
  permissions: GroupsPermissions,
  groupId: number,
  { databaseId }: DatabaseEntityId,
) => {
  return getPermission(
    permissions,
    groupId,
    [databaseId, "download", "schemas"],
    true,
  );
};

export const getTablesPermission = (
  permissions: GroupsPermissions,
  groupId: number,
  { databaseId, schemaName }: SchemaEntityId,
) => {
  const schemas = getSchemasDataPermission(permissions, groupId, {
    databaseId,
  });
  if (schemas === "controlled") {
    return getPermission(
      permissions,
      groupId,
      [databaseId, "data", "schemas", schemaName || ""],
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
) => {
  const tables = getTablesPermission(permissions, groupId, {
    databaseId,
    schemaName,
  });
  if (tables === "controlled") {
    return getPermission(
      permissions,
      groupId,
      [databaseId, "data", "schemas", schemaName ?? "", tableId],
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
  metadata: Metadata,
) {
  const currentSchemas = getSchemasDataPermission(permissions, groupId, {
    databaseId,
  });
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
      metadata,
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
      metadata,
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
  metadata: Metadata,
) {
  const { databaseId } = entityId;
  const database = metadata && metadata.database(databaseId);

  const entityIdsForDescendantTables = _.chain(database.tables)
    .filter(t => _.isMatch(t, entityIdToMetadataTableFields(entityId)))
    .map(metadataTableToTableEntityId)
    .value();

  const entityIdsByPermValue = _.chain(entityIdsForDescendantTables)
    .map(id => getFieldsPermission(permissions, groupId, id))
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
  metadata: Metadata,
) {
  const { databaseId } = entityId;
  const schemaName = (entityId as SchemaEntityId).schemaName ?? "";

  if (schemaName) {
    // Check all tables for current schema if their shared schema-level permission value should be updated
    const tablesPermissionValue = inferEntityPermissionValueFromChildTables(
      permissions,
      groupId,
      { databaseId, schemaName },
      metadata,
    );
    permissions = updateTablesPermission(
      permissions,
      groupId,
      { databaseId, schemaName },
      tablesPermissionValue,
      metadata,
    );
  }

  if (databaseId) {
    // Check all tables for current database if schemas' shared database-level permission value should be updated
    const schemasPermissionValue = inferEntityPermissionValueFromChildTables(
      permissions,
      groupId,
      { databaseId },
      metadata,
    );
    permissions = updateSchemasPermission(
      permissions,
      groupId,
      { databaseId },
      schemasPermissionValue,
      metadata,
    );
    permissions = downgradeNativePermissionsIfNeeded(
      permissions,
      groupId,
      { databaseId },
      schemasPermissionValue,
      metadata,
    );
  }

  return permissions;
}

export function updateFieldsPermission(
  permissions: GroupsPermissions,
  groupId: number,
  entityId: TableEntityId,
  value: any,
  metadata: Metadata,
) {
  const { databaseId, tableId } = entityId;
  const schemaName = entityId.schemaName || "";

  permissions = updateTablesPermission(
    permissions,
    groupId,
    { databaseId, schemaName },
    "controlled",
    metadata,
  );
  permissions = updatePermission(
    permissions,
    groupId,
    [databaseId, "data", "schemas", schemaName, tableId],
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
  metadata: Metadata,
) {
  const schema = metadata?.database(databaseId).schema(schemaName);
  const tableIds = schema?.tables.map((t: Table) => t.id);

  permissions = updateSchemasPermission(
    permissions,
    groupId,
    { databaseId },
    "controlled",
    metadata,
  );
  permissions = updatePermission(
    permissions,
    groupId,
    [databaseId, "data", "schemas", schemaName || ""],
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
  metadata: Metadata,
) {
  const database = metadata.database(databaseId) as any;
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
    metadata,
  );
  return updatePermission(
    permissions,
    groupId,
    [databaseId, "data", "schemas"],
    value,
    schemaNamesOrNoSchema,
  );
}

export function updateNativePermission(
  permissions: GroupsPermissions,
  groupId: number,
  { databaseId }: DatabaseEntityId,
  value: any,
  metadata: Metadata,
) {
  // if enabling native query write access, give access to all schemas since they are equivalent
  if (value === "write") {
    permissions = updateSchemasPermission(
      permissions,
      groupId,
      { databaseId },
      "all",
      metadata,
    );
  }
  return updatePermission(
    permissions,
    groupId,
    [databaseId, "data", "native"],
    value,
  );
}

function deleteIfEmpty(object: any, key: string | number) {
  if (Object.keys(object[key]).length === 0) {
    delete object[key];
  }
}

function diffDatabasePermissions(
  newPerms: GroupsPermissions,
  oldPerms: GroupsPermissions,
  groupId: number,
  database: Database,
) {
  const databaseDiff: {
    grantedTables: any;
    revokedTables: any;
    native?: any;
  } = {
    grantedTables: {},
    revokedTables: {},
  };
  // get the native permisisons for this db
  const oldNativePerm = getNativePermission(oldPerms, groupId, {
    databaseId: database.id,
  });
  const newNativePerm = getNativePermission(newPerms, groupId, {
    databaseId: database.id,
  });
  if (oldNativePerm !== newNativePerm) {
    databaseDiff.native = newNativePerm;
  }
  // check each table in this db
  for (const table of database.tables) {
    const oldFieldsPerm = getFieldsPermission(oldPerms, groupId, {
      databaseId: database.id,
      schemaName: table.schema_name || "",
      tableId: table.id,
    });
    const newFieldsPerm = getFieldsPermission(newPerms, groupId, {
      databaseId: database.id,
      schemaName: table.schema_name || "",
      tableId: table.id,
    });
    if (oldFieldsPerm !== newFieldsPerm) {
      if (isRestrictivePermission(newFieldsPerm)) {
        databaseDiff.revokedTables[table.id] = { name: table.display_name };
      } else {
        databaseDiff.grantedTables[table.id] = { name: table.display_name };
      }
    }
  }
  // remove types that have no tables
  for (const type of ["grantedTables", "revokedTables"]) {
    deleteIfEmpty(databaseDiff, type);
  }
  return databaseDiff;
}

function diffGroupPermissions(
  newPerms: GroupsPermissions,
  oldPerms: GroupsPermissions,
  groupId: number,
  databases: Database[],
) {
  const groupDiff: { databases: any } = { databases: {} };
  for (const database of databases) {
    groupDiff.databases[database.id] = diffDatabasePermissions(
      newPerms,
      oldPerms,
      groupId,
      database,
    );
    deleteIfEmpty(groupDiff.databases, database.id);
    if (groupDiff.databases[database.id]) {
      groupDiff.databases[database.id].name = database.name;
    }
  }
  deleteIfEmpty(groupDiff, "databases");
  return groupDiff;
}

export function diffDataPermissions(
  newPerms: GroupsPermissions,
  oldPerms: GroupsPermissions,
  groups: Group[],
  databases: Database[],
) {
  const permissionsDiff: { groups: any } = { groups: {} };
  if (newPerms && oldPerms && databases) {
    for (const group of groups) {
      permissionsDiff.groups[group.id] = diffGroupPermissions(
        newPerms,
        oldPerms,
        group.id,
        databases,
      );
      deleteIfEmpty(permissionsDiff.groups, group.id);
      if (permissionsDiff.groups[group.id]) {
        permissionsDiff.groups[group.id].name = group.name;
      }
    }
  }
  return permissionsDiff;
}
