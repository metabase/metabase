import { getIn, setIn } from "icepick";
import _ from "underscore";

import type { DatabaseId } from "metabase/meta/types/Database";
import type { SchemaName, TableId } from "metabase/meta/types/Table";

import Metadata from "metabase-lib/lib/metadata/Metadata";
import Database from "metabase-lib/lib/metadata/Database";
import Table from "metabase-lib/lib/metadata/Table";

import type {
  Group,
  GroupId,
  GroupsPermissions,
} from "metabase/meta/types/Permissions";

type TableEntityId = {
  databaseId: DatabaseId,
  schemaName: SchemaName,
  tableId: TableId,
};
type SchemaEntityId = { databaseId: DatabaseId, schemaName: SchemaName };
type DatabaseEntityId = { databaseId: DatabaseId };
type EntityId = TableEntityId | SchemaEntityId | DatabaseEntityId;

export function getPermission(
  permissions: GroupsPermissions,
  groupId: GroupId,
  path: Array<string | number>,
  isControlledType: boolean = false,
): string {
  let value = getIn(permissions, [groupId].concat(path));
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
  groupId: GroupId,
  path: Array<string | number>,
  value: string,
  entityIds: ?(Array<string> | Array<number>),
): GroupsPermissions {
  const fullPath = [groupId].concat(path);
  let current = getIn(permissions, fullPath);
  if (
    current === value ||
    (current && typeof current === "object" && value === "controlled")
  ) {
    return permissions;
  }
  let newValue;
  if (value === "controlled") {
    newValue = {};
    if (entityIds) {
      for (let entityId of entityIds) {
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
  groupId: GroupId,
  { databaseId }: DatabaseEntityId,
): string => {
  return getPermission(permissions, groupId, [databaseId, "schemas"], true);
};

export const getNativePermission = (
  permissions: GroupsPermissions,
  groupId: GroupId,
  { databaseId }: DatabaseEntityId,
): string => {
  return getPermission(permissions, groupId, [databaseId, "native"]);
};

export const getTablesPermission = (
  permissions: GroupsPermissions,
  groupId: GroupId,
  { databaseId, schemaName }: SchemaEntityId,
): string => {
  let schemas = getSchemasPermission(permissions, groupId, { databaseId });
  if (schemas === "controlled") {
    return getPermission(
      permissions,
      groupId,
      [databaseId, "schemas", schemaName],
      true,
    );
  } else {
    return schemas;
  }
};

export const getFieldsPermission = (
  permissions: GroupsPermissions,
  groupId: GroupId,
  { databaseId, schemaName, tableId }: TableEntityId,
): string => {
  let tables = getTablesPermission(permissions, groupId, {
    databaseId,
    schemaName,
  });
  if (tables === "controlled") {
    return getPermission(
      permissions,
      groupId,
      [databaseId, "schemas", schemaName, tableId],
      true,
    );
  } else {
    return tables;
  }
};

export function downgradeNativePermissionsIfNeeded(
  permissions: GroupsPermissions,
  groupId: GroupId,
  { databaseId }: DatabaseEntityId,
  value: string,
  metadata: Metadata,
): GroupsPermissions {
  let currentSchemas = getSchemasPermission(permissions, groupId, {
    databaseId,
  });
  let currentNative = getNativePermission(permissions, groupId, { databaseId });

  if (value === "none") {
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

const metadataTableToTableEntityId = (table: Table): TableEntityId => ({
  databaseId: table.db_id,
  schemaName: table.schema || "",
  tableId: table.id,
});

// TODO Atte Keinänen 6/24/17 See if this method could be simplified
const entityIdToMetadataTableFields = (entityId: EntityId) => ({
  ...(entityId.databaseId ? { db_id: entityId.databaseId } : {}),
  // $FlowFixMe Because schema name can be an empty string, which means an empty schema, this check becomes a little nasty
  ...(entityId.schemaName !== undefined
    ? { schema: entityId.schemaName !== "" ? entityId.schemaName : null }
    : {}),
  ...(entityId.tableId ? { id: entityId.tableId } : {}),
});

function inferEntityPermissionValueFromChildTables(
  permissions: GroupsPermissions,
  groupId: GroupId,
  entityId: DatabaseEntityId | SchemaEntityId,
  metadata: Metadata,
) {
  const { databaseId } = entityId;
  const database = metadata && metadata.databases[databaseId];

  const entityIdsForDescendantTables: TableEntityId[] = _.chain(database.tables)
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
  groupId: GroupId,
  entityId: DatabaseEntityId | SchemaEntityId,
  metadata: Metadata,
) {
  // $FlowFixMe
  const { databaseId, schemaName } = entityId;

  if (schemaName) {
    // Check all tables for current schema if their shared schema-level permission value should be updated
    // $FlowFixMe
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
  groupId: GroupId,
  entityId: TableEntityId,
  value: string,
  metadata: Metadata,
): GroupsPermissions {
  const { databaseId, schemaName, tableId } = entityId;

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
    [databaseId, "schemas", schemaName, tableId],
    value /* TODO: field ids, when enabled "controlled" fields */,
  );

  return permissions;
}

export function updateTablesPermission(
  permissions: GroupsPermissions,
  groupId: GroupId,
  { databaseId, schemaName }: SchemaEntityId,
  value: string,
  metadata: Metadata,
): GroupsPermissions {
  const database = metadata && metadata.databases[databaseId];
  const tableIds: ?(number[]) =
    database &&
    database.tables.filter(t => (t.schema || "") === schemaName).map(t => t.id);

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
    [databaseId, "schemas", schemaName],
    value,
    tableIds,
  );

  return permissions;
}

export function updateSchemasPermission(
  permissions: GroupsPermissions,
  groupId: GroupId,
  { databaseId }: DatabaseEntityId,
  value: string,
  metadata: Metadata,
): GroupsPermissions {
  const database = metadata.databases[databaseId];
  const schemaNames = database && database.schemaNames();
  const schemaNamesOrNoSchema =
    schemaNames && schemaNames.length > 0 ? schemaNames : [""];

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
    [databaseId, "schemas"],
    value,
    schemaNamesOrNoSchema,
  );
}

export function updateNativePermission(
  permissions: GroupsPermissions,
  groupId: GroupId,
  { databaseId }: DatabaseEntityId,
  value: string,
  metadata: Metadata,
): GroupsPermissions {
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
  return updatePermission(permissions, groupId, [databaseId, "native"], value);
}

type PermissionsDiff = {
  groups: {
    [key: GroupId]: GroupPermissionsDiff,
  },
};

type GroupPermissionsDiff = {
  name?: string,
  databases: {
    [key: DatabaseId]: DatabasePermissionsDiff,
  },
};

type DatabasePermissionsDiff = {
  name?: string,
  native?: string,
  revokedTables: {
    [key: TableId]: TablePermissionsDiff,
  },
  grantedTables: {
    [key: TableId]: TablePermissionsDiff,
  },
};

type TablePermissionsDiff = {
  name?: string,
};

function deleteIfEmpty(object: { [key: any]: any }, key: any) {
  if (Object.keys(object[key]).length === 0) {
    delete object[key];
  }
}

function diffDatabasePermissions(
  newPerms: GroupsPermissions,
  oldPerms: GroupsPermissions,
  groupId: GroupId,
  database: Database,
): DatabasePermissionsDiff {
  const databaseDiff: DatabasePermissionsDiff = {
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
      schemaName: table.schema || "",
      tableId: table.id,
    });
    const newFieldsPerm = getFieldsPermission(newPerms, groupId, {
      databaseId: database.id,
      schemaName: table.schema || "",
      tableId: table.id,
    });
    if (oldFieldsPerm !== newFieldsPerm) {
      if (newFieldsPerm === "none") {
        databaseDiff.revokedTables[table.id] = { name: table.display_name };
      } else {
        databaseDiff.grantedTables[table.id] = { name: table.display_name };
      }
    }
  }
  // remove types that have no tables
  for (let type of ["grantedTables", "revokedTables"]) {
    deleteIfEmpty(databaseDiff, type);
  }
  return databaseDiff;
}

function diffGroupPermissions(
  newPerms: GroupsPermissions,
  oldPerms: GroupsPermissions,
  groupId: GroupId,
  metadata: Metadata,
): GroupPermissionsDiff {
  let groupDiff: GroupPermissionsDiff = { databases: {} };
  for (const database of metadata.databasesList()) {
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

export function diffPermissions(
  newPerms: GroupsPermissions,
  oldPerms: GroupsPermissions,
  groups: Array<Group>,
  metadata: Metadata,
): PermissionsDiff {
  let permissionsDiff: PermissionsDiff = { groups: {} };
  if (newPerms && oldPerms && metadata) {
    for (let group of groups) {
      permissionsDiff.groups[group.id] = diffGroupPermissions(
        newPerms,
        oldPerms,
        group.id,
        metadata,
      );
      deleteIfEmpty(permissionsDiff.groups, group.id);
      if (permissionsDiff.groups[group.id]) {
        permissionsDiff.groups[group.id].name = group.name;
      }
    }
  }
  return permissionsDiff;
}
