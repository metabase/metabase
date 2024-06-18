import type Database from "metabase-lib/v1/metadata/Database";
import type {
  ConcreteTableId,
  Group,
  GroupsPermissions,
} from "metabase-types/api";

import { DataPermission } from "../../types";

import {
  getFieldsPermission,
  getSchemasPermission,
  isRestrictivePermission,
} from "./data-permissions";

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
  // get the native permissions for this db
  const oldNativePerm = getSchemasPermission(
    oldPerms,
    groupId,
    { databaseId: database.id },
    DataPermission.CREATE_QUERIES,
  );
  const newNativePerm = getSchemasPermission(
    newPerms,
    groupId,
    { databaseId: database.id },
    DataPermission.CREATE_QUERIES,
  );
  if (oldNativePerm !== newNativePerm) {
    databaseDiff.native = newNativePerm;
  }
  // check each table in this db
  for (const table of database.tables ?? []) {
    const oldFieldsPerm = getFieldsPermission(
      oldPerms,
      groupId,
      {
        databaseId: database.id,
        schemaName: table.schema_name || "",
        tableId: table.id as ConcreteTableId,
      },
      DataPermission.VIEW_DATA,
    );
    const newFieldsPerm = getFieldsPermission(
      newPerms,
      groupId,
      {
        databaseId: database.id,
        schemaName: table.schema_name || "",
        tableId: table.id as ConcreteTableId,
      },
      DataPermission.VIEW_DATA,
    );
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
