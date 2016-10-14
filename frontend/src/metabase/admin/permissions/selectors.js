/* @flow weak */

import { createSelector } from 'reselect';

import { push } from "react-router-redux";

import Metadata from "metabase/meta/metadata/Metadata";
import MetabaseAnalytics from "metabase/lib/analytics";

import type { DatabaseId } from "metabase/meta/types/Database";
import type { SchemaName } from "metabase/meta/types/Table";
import type { Group, GroupsPermissions } from "metabase/meta/types/Permissions";

import { isDefaultGroup, isAdminGroup, isMetaBotGroup } from "metabase/lib/groups";
import _ from "underscore";

import {
    getNativePermission,
    getSchemasPermission,
    getTablesPermission,
    getFieldsPermission,
    updateFieldsPermission,
    updateTablesPermission,
    updateSchemasPermission,
    updateNativePermission,
    diffPermissions,
} from "metabase/lib/permissions";

const getPermissions = (state) => state.permissions.permissions;
const getOriginalPermissions = (state) => state.permissions.originalPermissions;

const getDatabaseId = (state, props) => props.params.databaseId ? parseInt(props.params.databaseId) : null
const getSchemaName = (state, props) => props.params.schemaName

const getMetadata = createSelector(
    [(state) => state.permissions.databases],
    (databases) => databases && new Metadata(databases)
);

// reorder groups to be in this order
const SPECIAL_GROUP_FILTERS = [isAdminGroup, isDefaultGroup, isMetaBotGroup].reverse();

export const getGroups = createSelector(
    (state) => state.permissions.groups,
    (groups) => {
        let orderedGroups = groups ? [...groups] : [];
        for (let groupFilter of SPECIAL_GROUP_FILTERS) {
            let index = _.findIndex(orderedGroups, groupFilter);
            if (index >= 0) {
                orderedGroups.unshift(...orderedGroups.splice(index, 1))
            }
        }
        return orderedGroups;
    }
);

export const getIsDirty = createSelector(
    getPermissions, getOriginalPermissions,
    (permissions, originalPermissions) =>
        JSON.stringify(permissions) !== JSON.stringify(originalPermissions)
)

export const getSaveError = (state) => state.permissions.saveError;

export const getTablesPermissionsGrid = createSelector(
    getMetadata, getGroups, getPermissions, getDatabaseId, getSchemaName,
    (metadata: Metadata, groups: Array<Group>, permissions: GroupsPermissions, databaseId: DatabaseId, schemaName: SchemaName) => {
        const database = metadata && metadata.database(databaseId);

        if (!groups || !permissions || !metadata || !database) {
            return null;
        }

        const tables = database.tablesInSchema(schemaName || null);

        return {
            type: "table",
            crumbs: database.schemaNames().length > 1 ? [
                ["Databases", "/admin/permissions/databases"],
                [database.name, "/admin/permissions/databases/"+database.id+"/schemas"],
                [schemaName]
            ] : [
                ["Databases", "/admin/permissions/databases"],
                [database.name],
            ],
            groups,
            permissions: {
                "fields": {
                    options(groupId, entityId) {
                        return ["all", "none"]
                    },
                    getter(groupId, entityId) {
                        return getFieldsPermission(permissions, groupId, entityId);
                    },
                    updater(groupId, entityId, value) {
                        MetabaseAnalytics.trackEvent("Permissions", "fields", value);
                        return updateFieldsPermission(permissions, groupId, entityId, value, metadata);
                    },
                    confirm(groupId, entityId, value) {
                        if (getSchemasPermission(permissions, groupId, entityId) !== "controlled") {
                            return {
                                title: "Changing this database to limited access"
                            };
                        }
                    }
                }
            },
            entities: tables.map(table => ({
                id: {
                    databaseId: databaseId,
                    schemaName: schemaName,
                    tableId: table.id
                },
                name: table.display_name,
                subtitle: table.name
            }))
        };
    }
);

export const getSchemasPermissionsGrid = createSelector(
    getMetadata, getGroups, getPermissions, getDatabaseId,
    (metadata: Metadata, groups: Array<Group>, permissions: GroupsPermissions, databaseId: DatabaseId) => {
        const database = metadata && metadata.database(databaseId);

        if (!groups || !permissions || !metadata || !database) {
            return null;
        }

        const schemaNames = database.schemaNames();

        return {
            type: "schema",
            crumbs: [
                ["Databases", "/admin/permissions/databases"],
                [database.name],
            ],
            groups,
            permissions: {
                "tables": {
                    options(groupId, entityId) {
                        return ["all", "controlled", "none"]
                    },
                    getter(groupId, entityId) {
                        return getTablesPermission(permissions, groupId, entityId);
                    },
                    updater(groupId, entityId, value) {
                        MetabaseAnalytics.trackEvent("Permissions", "tables", value);
                        return updateTablesPermission(permissions, groupId, entityId, value, metadata);
                    },
                    postAction(groupId, { databaseId, schemaName }, value) {
                        if (value === "controlled") {
                            return push(`/admin/permissions/databases/${databaseId}/schemas/${encodeURIComponent(schemaName)}/tables`);
                        }
                    },
                    confirm(groupId, entityId, value) {
                        if (getSchemasPermission(permissions, groupId, entityId) !== "controlled") {
                            return {
                                title: "Changing this database to limited access"
                            };
                        }
                    }
                }
            },
            entities: schemaNames.map(schemaName => ({
                id: {
                    databaseId,
                    schemaName
                },
                name: schemaName,
                link: { name: "View tables", url: `/admin/permissions/databases/${databaseId}/schemas/${encodeURIComponent(schemaName)}/tables`}
            }))
        }
    }
);

export const getDatabasesPermissionsGrid = createSelector(
    getMetadata, getGroups, getPermissions,
    (metadata: Metadata, groups: Array<Group>, permissions: GroupsPermissions) => {
        if (!groups || !permissions || !metadata) {
            return null;
        }

        const databases = metadata.databases();

        return {
            type: "database",
            groups,
            permissions: {
                "schemas": {
                    options(groupId, entityId) {
                        return ["all", "controlled", "none"]
                    },
                    getter(groupId, entityId) {
                        return getSchemasPermission(permissions, groupId, entityId);
                    },
                    updater(groupId, entityId, value) {
                        MetabaseAnalytics.trackEvent("Permissions", "schemas", value);
                        return updateSchemasPermission(permissions, groupId, entityId, value, metadata)
                    },
                    postAction(groupId, { databaseId }, value) {
                        if (value === "controlled") {
                            let database = metadata.database(databaseId);
                            let schemas = database ? database.schemaNames() : [];
                            if (schemas.length === 0 || (schemas.length === 1 && schemas[0] === "")) {
                                return push(`/admin/permissions/databases/${databaseId}/tables`);
                            } else if (schemas.length === 1) {
                                return push(`/admin/permissions/databases/${databaseId}/schemas/${schemas[0]}/tables`);
                            } else {
                                return push(`/admin/permissions/databases/${databaseId}/schemas`);
                            }
                        }
                    },
                },
                "native": {
                    options(groupId, entityId) {
                        if (getSchemasPermission(permissions, groupId, entityId) === "none") {
                            return ["none"];
                        } else {
                            return ["write", "read", "none"];
                        }
                    },
                    getter(groupId, entityId) {
                        return getNativePermission(permissions, groupId, entityId);
                    },
                    updater(groupId, entityId, value) {
                        MetabaseAnalytics.trackEvent("Permissions", "native", value);
                        return updateNativePermission(permissions, groupId, entityId, value, metadata);
                    },
                    confirm(groupId, entityId, value) {
                        if (value === "write" &&
                            getNativePermission(permissions, groupId, entityId) !== "write" &&
                            getSchemasPermission(permissions, groupId, entityId) !== "all"
                        ) {
                            return {
                                title: "Allow Raw Query Writing",
                                message: "This will also change this group's data access to Unrestricted for this database."
                            };
                        }
                    }
                },
            },
            entities: databases.map(database => {
                let schemas = database.schemaNames();
                return {
                    id: {
                        databaseId: database.id
                    },
                    name: database.name,
                    link:
                        schemas.length === 0 || (schemas.length === 1 && schemas[0] === "") ?
                            { name: "View tables", url: `/admin/permissions/databases/${database.id}/tables` }
                        : schemas.length === 1 ?
                            { name: "View tables", url: `/admin/permissions/databases/${database.id}/schemas/${schemas[0]}/tables` }
                        :
                            { name: "View schemas", url: `/admin/permissions/databases/${database.id}/schemas`}
                }
            })
        }
    }
);

export const getDiff = createSelector(
    getMetadata, getGroups, getPermissions, getOriginalPermissions,
    (metadata: Metadata, groups: Array<Group>, permissions: GroupsPermissions, originalPermissions: GroupsPermissions) =>
        diffPermissions(permissions, originalPermissions, groups, metadata)
);
