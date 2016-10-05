/* @flow */

import { getIn, setIn } from "icepick";

import type Database from "metabase/meta/metadata/Database";
import type { DatabaseId } from "metabase/meta/types/Database";
import type { SchemaName, TableId } from "metabase/meta/types/Table";
import Metadata from "metabase/meta/metadata/Metadata";

import type { Group, GroupId, GroupsPermissions } from "metabase/meta/types/Permissions";

type TableEntityId = { databaseId: DatabaseId, schemaName: SchemaName, tableId: TableId };
type SchemaEntityId = { databaseId: DatabaseId, schemaName: SchemaName };
type DatabaseEntityId = { databaseId: DatabaseId };

export function getPermission(
    permissions: GroupsPermissions,
    groupId: GroupId,
    path: Array<string|number>,
    isControlledType: bool = false
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
    } else {
        return value;
    }
}

export function updatePermission(
    permissions: GroupsPermissions,
    groupId: GroupId,
    path: Array<string|number>,
    value: string,
    entityIds: ?Array<string|number>
): GroupsPermissions {
    const fullPath = [groupId].concat(path);
    let current = getIn(permissions, fullPath);
    if (current === value || (current && typeof current === "object" && value === "controlled")) {
        return permissions;
    }
    let newValue;
    if (value === "controlled") {
        newValue = {};
        if (entityIds) {
            for (let entityId of entityIds) {
                newValue[entityId] = current
            }
        }
    } else {
        newValue = value;
    }
    for (var i = 0; i < fullPath.length; i++) {
        if (typeof getIn(permissions, fullPath.slice(0, i)) === "string") {
            permissions = setIn(permissions, fullPath.slice(0, i), {});
        }
    }
    return setIn(permissions, fullPath, newValue);
}

export const getSchemasPermission = (permissions: GroupsPermissions, groupId: GroupId, { databaseId }: DatabaseEntityId): string => {
    return getPermission(permissions, groupId, [databaseId, "schemas"], true);
}

export const getNativePermission = (permissions: GroupsPermissions, groupId: GroupId, { databaseId }: DatabaseEntityId): string => {
    return getPermission(permissions, groupId, [databaseId, "native"]);
}

export const getTablesPermission = (permissions: GroupsPermissions, groupId: GroupId, { databaseId, schemaName }: SchemaEntityId): string => {
    let schemas = getSchemasPermission(permissions, groupId, { databaseId });
    if (schemas === "controlled") {
        return getPermission(permissions, groupId, [databaseId, "schemas", schemaName], true);
    } else {
        return schemas;
    }
}

export const getFieldsPermission = (permissions: GroupsPermissions, groupId: GroupId, { databaseId, schemaName, tableId }: TableEntityId): string => {
    let tables = getTablesPermission(permissions, groupId, { databaseId, schemaName });
    if (tables === "controlled") {
        return getPermission(permissions, groupId, [databaseId, "schemas", schemaName, tableId], true);
    } else {
        return tables;
    }
}

export function updateFieldsPermission(permissions: GroupsPermissions, groupId: GroupId, { databaseId, schemaName, tableId }: TableEntityId, value: string, metadata: Metadata): GroupsPermissions {

    permissions = updateTablesPermission(permissions, groupId, { databaseId, schemaName }, "controlled", metadata);
    permissions = updatePermission(permissions, groupId, [databaseId, "schemas", schemaName, tableId], value /* TODO: field ids, when enabled "controlled" fields */);

    return permissions;
}

export function updateTablesPermission(permissions: GroupsPermissions, groupId: GroupId, { databaseId, schemaName }: SchemaEntityId, value: string, metadata: Metadata): GroupsPermissions {
    const database = metadata && metadata.database(databaseId);
    const tableIds = database && database.tables().map(t => t.id);

    permissions = updateSchemasPermission(permissions, groupId, { databaseId }, "controlled", metadata);
    permissions = updatePermission(permissions, groupId, [databaseId, "schemas", schemaName], value, tableIds);

    return permissions;
}

export function updateSchemasPermission(permissions: GroupsPermissions, groupId: GroupId, { databaseId }: DatabaseEntityId, value: string, metadata: Metadata): GroupsPermissions {
    let database = metadata.database(databaseId);
    let schemaNames = database && database.schemaNames();

    let currentSchemas = getSchemasPermission(permissions, groupId, { databaseId });
    let currentNative = getNativePermission(permissions, groupId, { databaseId });

    if (value === "none") {
        // if changing schemas to none, downgrade native to none
        permissions = updateNativePermission(permissions, groupId, { databaseId }, "none", metadata);
    } else if (value === "controlled" && currentSchemas === "all" && currentNative === "write") {
        // if changing schemas to controlled, downgrade native to read
        permissions = updateNativePermission(permissions, groupId, { databaseId }, "read", metadata);
    }

    return updatePermission(permissions, groupId, [databaseId, "schemas"], value, schemaNames);
}

export function updateNativePermission(permissions: GroupsPermissions, groupId: GroupId, { databaseId }: DatabaseEntityId, value: string, metadata: Metadata): GroupsPermissions {
    // if enabling native query write access, give access to all schemas since they are equivalent
    if (value === "write") {
        permissions = updateSchemasPermission(permissions, groupId, { databaseId }, "all", metadata);
    }
    return updatePermission(permissions, groupId, [databaseId, "native"], value);
}

type PermissionsDiff = {
    groups: {
        [key: GroupId]: GroupPermissionsDiff
    }
}

type GroupPermissionsDiff = {
    name?: string,
    databases: {
        [key: DatabaseId]: DatabasePermissionsDiff
    }
}

type DatabasePermissionsDiff = {
    name?: string,
    native?: string,
    revokedTables: {
        [key: TableId]: TablePermissionsDiff
    },
    grantedTables: {
        [key: TableId]: TablePermissionsDiff
    },
}

type TablePermissionsDiff = {
    name?: string,
}

function deleteIfEmpty(object: { [key: any]: any }, key: any) {
    if (Object.keys(object[key]).length === 0) {
        delete object[key];
    }
}

function diffDatabasePermissions(newPerms: GroupsPermissions, oldPerms: GroupsPermissions, groupId: GroupId, database: Database): DatabasePermissionsDiff {
    const databaseDiff: DatabasePermissionsDiff = { grantedTables: {}, revokedTables: {} };
    // get the native permisisons for this db
    const oldNativePerm = getNativePermission(oldPerms, groupId, { databaseId: database.id });
    const newNativePerm = getNativePermission(newPerms, groupId, { databaseId: database.id });
    if (oldNativePerm !== newNativePerm) {
        databaseDiff.native = newNativePerm;
    }
    // check each table in this db
    for (const table of database.tables()) {
        const oldFieldsPerm = getFieldsPermission(oldPerms, groupId, { databaseId: database.id, schemaName: table.schema || "", tableId: table.id });
        const newFieldsPerm = getFieldsPermission(newPerms, groupId, { databaseId: database.id, schemaName: table.schema || "", tableId: table.id });
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

function diffGroupPermissions(newPerms: GroupsPermissions, oldPerms: GroupsPermissions, groupId: GroupId, metadata: Metadata): GroupPermissionsDiff {
    let groupDiff: GroupPermissionsDiff = { databases: {} };
    for (const database of metadata.databases()) {
        groupDiff.databases[database.id] = diffDatabasePermissions(newPerms, oldPerms, groupId, database);
        deleteIfEmpty(groupDiff.databases, database.id);
        if (groupDiff.databases[database.id]) {
            groupDiff.databases[database.id].name = database.name;
        }
    }
    deleteIfEmpty(groupDiff, "databases");
    return groupDiff;
}

export function diffPermissions(newPerms: GroupsPermissions, oldPerms: GroupsPermissions, groups: Array<Group>, metadata: Metadata): PermissionsDiff {
    let permissionsDiff: PermissionsDiff = { groups: {} };
    if (newPerms && oldPerms && metadata) {
        for (let group of groups) {
            permissionsDiff.groups[group.id] = diffGroupPermissions(newPerms, oldPerms, group.id, metadata);
            deleteIfEmpty(permissionsDiff.groups, group.id);
            if (permissionsDiff.groups[group.id]) {
                permissionsDiff.groups[group.id].name = group.name;
            }
        }
    }
    return permissionsDiff;
}
