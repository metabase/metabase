/* @flow weak */

import { createSelector } from "reselect";

import { push } from "react-router-redux";

import MetabaseAnalytics from "metabase/lib/analytics";
import { t } from "c-3po";
import {
  isDefaultGroup,
  isAdminGroup,
  isMetaBotGroup,
} from "metabase/lib/groups";

import _ from "underscore";
import { getIn, assocIn } from "icepick";

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
  inferAndUpdateEntityPermissions,
} from "metabase/lib/permissions";

import { getMetadata } from "metabase/selectors/metadata";

import Metadata from "metabase-lib/lib/metadata/Metadata";
import type { DatabaseId } from "metabase/meta/types/Database";
import type { SchemaName } from "metabase/meta/types/Table";
import type { Group, GroupsPermissions } from "metabase/meta/types/Permissions";

const getPermissions = state => state.admin.permissions.permissions;
const getOriginalPermissions = state =>
  state.admin.permissions.originalPermissions;

const getDatabaseId = (state, props) =>
  props.params.databaseId ? parseInt(props.params.databaseId) : null;
const getSchemaName = (state, props) => props.params.schemaName;

// reorder groups to be in this order
const SPECIAL_GROUP_FILTERS = [
  isAdminGroup,
  isDefaultGroup,
  isMetaBotGroup,
].reverse();

function getTooltipForGroup(group) {
  if (isAdminGroup(group)) {
    return t`Administrators always have the highest level of access to everything in Metabase.`;
  } else if (isDefaultGroup(group)) {
    return t`Every Metabase user belongs to the All Users group. If you want to limit or restrict a group's access to something, make sure the All Users group has an equal or lower level of access.`;
  } else if (isMetaBotGroup(group)) {
    return t`MetaBot is Metabase's Slack bot. You can choose what it has access to here.`;
  }
  return null;
}

export const getGroups = createSelector(
  state => state.admin.permissions.groups,
  groups => {
    let orderedGroups = groups ? [...groups] : [];
    for (let groupFilter of SPECIAL_GROUP_FILTERS) {
      let index = _.findIndex(orderedGroups, groupFilter);
      if (index >= 0) {
        orderedGroups.unshift(...orderedGroups.splice(index, 1));
      }
    }
    return orderedGroups.map(group => ({
      ...group,
      tooltip: getTooltipForGroup(group),
    }));
  },
);

export const getIsDirty = createSelector(
  getPermissions,
  getOriginalPermissions,
  (permissions, originalPermissions) =>
    JSON.stringify(permissions) !== JSON.stringify(originalPermissions),
);

export const getSaveError = state => state.admin.permissions.saveError;

// these are all the permission levels ordered by level of access
const PERM_LEVELS = ["write", "read", "all", "controlled", "none"];
function hasGreaterPermissions(a, b) {
  return PERM_LEVELS.indexOf(a) - PERM_LEVELS.indexOf(b) < 0;
}

function getPermissionWarning(
  getter,
  entityType,
  defaultGroup,
  permissions,
  groupId,
  entityId,
  value,
) {
  if (!defaultGroup || groupId === defaultGroup.id) {
    return null;
  }
  let perm = value || getter(permissions, groupId, entityId);
  let defaultPerm = getter(permissions, defaultGroup.id, entityId);
  if (perm === "controlled" && defaultPerm === "controlled") {
    return t`The "${
      defaultGroup.name
    }" group may have access to a different set of ${entityType} than this group, which may give this group additional access to some ${entityType}.`;
  }
  if (hasGreaterPermissions(defaultPerm, perm)) {
    return t`The "${
      defaultGroup.name
    }" group has a higher level of access than this, which will override this setting. You should limit or revoke the "${
      defaultGroup.name
    }" group's access to this item.`;
  }
  return null;
}

function getPermissionWarningModal(
  entityType,
  getter,
  defaultGroup,
  permissions,
  groupId,
  entityId,
  value,
) {
  let permissionWarning = getPermissionWarning(
    entityType,
    getter,
    defaultGroup,
    permissions,
    groupId,
    entityId,
    value,
  );
  if (permissionWarning) {
    return {
      title:
        (value === "controlled" ? t`Limit` : t`Revoke`) +
        " " +
        t`access even though "${defaultGroup.name}" has greater access?`,
      message: permissionWarning,
      confirmButtonText:
        value === "controlled" ? t`Limit access` : t`Revoke access`,
      cancelButtonText: t`Cancel`,
    };
  }
}

function getControlledDatabaseWarningModal(permissions, groupId, entityId) {
  if (getSchemasPermission(permissions, groupId, entityId) !== "controlled") {
    return {
      title: t`Change access to this database to limited?`,
      confirmButtonText: t`Change`,
      cancelButtonText: t`Cancel`,
    };
  }
}

function getRawQueryWarningModal(permissions, groupId, entityId, value) {
  if (
    value === "write" &&
    getNativePermission(permissions, groupId, entityId) !== "write" &&
    getSchemasPermission(permissions, groupId, entityId) !== "all"
  ) {
    return {
      title: t`Allow Raw Query Writing?`,
      message: t`This will also change this group's data access to Unrestricted for this database.`,
      confirmButtonText: t`Allow`,
      cancelButtonText: t`Cancel`,
    };
  }
}

// If the user is revoking an access to every single table of a database for a specific user group,
// warn the user that the access to raw queries will be revoked as well.
// This warning will only be shown if the user is editing the permissions of individual tables.
function getRevokingAccessToAllTablesWarningModal(
  database,
  permissions,
  groupId,
  entityId,
  value,
) {
  if (
    value === "none" &&
    getSchemasPermission(permissions, groupId, entityId) === "controlled" &&
    getNativePermission(permissions, groupId, entityId) !== "none"
  ) {
    // allTableEntityIds contains tables from all schemas
    const allTableEntityIds = database.tables.map(table => ({
      databaseId: table.db_id,
      schemaName: table.schema || "",
      tableId: table.id,
    }));

    // Show the warning only if user tries to revoke access to the very last table of all schemas
    const afterChangesNoAccessToAnyTable = _.every(
      allTableEntityIds,
      id =>
        getFieldsPermission(permissions, groupId, id) === "none" ||
        _.isEqual(id, entityId),
    );
    if (afterChangesNoAccessToAnyTable) {
      return {
        title: t`Revoke access to all tables?`,
        message: t`This will also revoke this group's access to raw queries for this database.`,
        confirmButtonText: t`Revoke access`,
        cancelButtonText: t`Cancel`,
      };
    }
  }
}

const OPTION_GREEN = {
  icon: "check",
  iconColor: "#9CC177",
  bgColor: "#F6F9F2",
};
const OPTION_YELLOW = {
  icon: "eye",
  iconColor: "#F9D45C",
  bgColor: "#FEFAEE",
};
const OPTION_RED = {
  icon: "close",
  iconColor: "#EEA5A5",
  bgColor: "#FDF3F3",
};

const OPTION_ALL = {
  ...OPTION_GREEN,
  value: "all",
  title: t`Grant unrestricted access`,
  tooltip: t`Unrestricted access`,
};

const OPTION_CONTROLLED = {
  ...OPTION_YELLOW,
  value: "controlled",
  title: t`Limit access`,
  tooltip: t`Limited access`,
  icon: "permissionsLimited",
};

const OPTION_NONE = {
  ...OPTION_RED,
  value: "none",
  title: t`Revoke access`,
  tooltip: t`No access`,
};

const OPTION_NATIVE_WRITE = {
  ...OPTION_GREEN,
  value: "write",
  title: t`Write raw queries`,
  tooltip: t`Can write raw queries`,
  icon: "sql",
};

const OPTION_COLLECTION_WRITE = {
  ...OPTION_GREEN,
  value: "write",
  title: t`Curate collection`,
  tooltip: t`Can add and remove questions from this collection`,
};

const OPTION_COLLECTION_READ = {
  ...OPTION_YELLOW,
  value: "read",
  title: t`View collection`,
  tooltip: t`Can view questions in this collection`,
};

export const getTablesPermissionsGrid = createSelector(
  getMetadata,
  getGroups,
  getPermissions,
  getDatabaseId,
  getSchemaName,
  (
    metadata: Metadata,
    groups: Array<Group>,
    permissions: GroupsPermissions,
    databaseId: DatabaseId,
    schemaName: SchemaName,
  ) => {
    const database = metadata.databases[databaseId];

    if (!groups || !permissions || !database) {
      return null;
    }

    const tables = database.tablesInSchema(schemaName || null);
    const defaultGroup = _.find(groups, isDefaultGroup);

    return {
      type: "table",
      icon: "table",
      crumbs:
        database.schemaNames().length > 1
          ? [
              [t`Databases`, "/admin/permissions/databases"],
              [
                database.name,
                "/admin/permissions/databases/" + database.id + "/schemas",
              ],
              [schemaName],
            ]
          : [[t`Databases`, "/admin/permissions/databases"], [database.name]],
      groups,
      permissions: {
        fields: {
          header: t`Data Access`,
          options(groupId, entityId) {
            return [OPTION_ALL, OPTION_NONE];
          },
          getter(groupId, entityId) {
            return getFieldsPermission(permissions, groupId, entityId);
          },
          updater(groupId, entityId, value) {
            MetabaseAnalytics.trackEvent("Permissions", "fields", value);
            let updatedPermissions = updateFieldsPermission(
              permissions,
              groupId,
              entityId,
              value,
              metadata,
            );
            return inferAndUpdateEntityPermissions(
              updatedPermissions,
              groupId,
              entityId,
              metadata,
            );
          },
          confirm(groupId, entityId, value) {
            return [
              getPermissionWarningModal(
                getFieldsPermission,
                "fields",
                defaultGroup,
                permissions,
                groupId,
                entityId,
                value,
              ),
              getControlledDatabaseWarningModal(permissions, groupId, entityId),
              getRevokingAccessToAllTablesWarningModal(
                database,
                permissions,
                groupId,
                entityId,
                value,
              ),
            ];
          },
          warning(groupId, entityId) {
            return getPermissionWarning(
              getFieldsPermission,
              "fields",
              defaultGroup,
              permissions,
              groupId,
              entityId,
            );
          },
        },
      },
      entities: tables.map(table => ({
        id: {
          databaseId: databaseId,
          schemaName: schemaName,
          tableId: table.id,
        },
        name: table.display_name,
        subtitle: table.name,
      })),
    };
  },
);

export const getSchemasPermissionsGrid = createSelector(
  getMetadata,
  getGroups,
  getPermissions,
  getDatabaseId,
  (
    metadata: Metadata,
    groups: Array<Group>,
    permissions: GroupsPermissions,
    databaseId: DatabaseId,
  ) => {
    const database = metadata.databases[databaseId];

    if (!groups || !permissions || !database) {
      return null;
    }

    const schemaNames = database.schemaNames();
    const defaultGroup = _.find(groups, isDefaultGroup);

    return {
      type: "schema",
      icon: "folder",
      crumbs: [[t`Databases`, "/admin/permissions/databases"], [database.name]],
      groups,
      permissions: {
        tables: {
          header: t`Data Access`,
          options(groupId, entityId) {
            return [OPTION_ALL, OPTION_CONTROLLED, OPTION_NONE];
          },
          getter(groupId, entityId) {
            return getTablesPermission(permissions, groupId, entityId);
          },
          updater(groupId, entityId, value) {
            MetabaseAnalytics.trackEvent("Permissions", "tables", value);
            let updatedPermissions = updateTablesPermission(
              permissions,
              groupId,
              entityId,
              value,
              metadata,
            );
            return inferAndUpdateEntityPermissions(
              updatedPermissions,
              groupId,
              entityId,
              metadata,
            );
          },
          postAction(groupId, { databaseId, schemaName }, value) {
            if (value === "controlled") {
              return push(
                `/admin/permissions/databases/${databaseId}/schemas/${encodeURIComponent(
                  schemaName,
                )}/tables`,
              );
            }
          },
          confirm(groupId, entityId, value) {
            return [
              getPermissionWarningModal(
                getTablesPermission,
                "tables",
                defaultGroup,
                permissions,
                groupId,
                entityId,
                value,
              ),
              getControlledDatabaseWarningModal(permissions, groupId, entityId),
            ];
          },
          warning(groupId, entityId) {
            return getPermissionWarning(
              getTablesPermission,
              "tables",
              defaultGroup,
              permissions,
              groupId,
              entityId,
            );
          },
        },
      },
      entities: schemaNames.map(schemaName => ({
        id: {
          databaseId,
          schemaName,
        },
        name: schemaName,
        link: {
          name: t`View tables`,
          url: `/admin/permissions/databases/${databaseId}/schemas/${encodeURIComponent(
            schemaName,
          )}/tables`,
        },
      })),
    };
  },
);

export const getDatabasesPermissionsGrid = createSelector(
  getMetadata,
  getGroups,
  getPermissions,
  (
    metadata: Metadata,
    groups: Array<Group>,
    permissions: GroupsPermissions,
  ) => {
    if (!groups || !permissions || !metadata) {
      return null;
    }

    const databases = Object.values(metadata.databases);
    const defaultGroup = _.find(groups, isDefaultGroup);

    return {
      type: "database",
      icon: "database",
      groups,
      permissions: {
        schemas: {
          header: t`Data Access`,
          options(groupId, entityId) {
            return [OPTION_ALL, OPTION_CONTROLLED, OPTION_NONE];
          },
          getter(groupId, entityId) {
            return getSchemasPermission(permissions, groupId, entityId);
          },
          updater(groupId, entityId, value) {
            MetabaseAnalytics.trackEvent("Permissions", "schemas", value);
            return updateSchemasPermission(
              permissions,
              groupId,
              entityId,
              value,
              metadata,
            );
          },
          postAction(groupId, { databaseId }, value) {
            if (value === "controlled") {
              let database = metadata.databases[databaseId];
              let schemas = database ? database.schemaNames() : [];
              if (
                schemas.length === 0 ||
                (schemas.length === 1 && schemas[0] === "")
              ) {
                return push(
                  `/admin/permissions/databases/${databaseId}/tables`,
                );
              } else if (schemas.length === 1) {
                return push(
                  `/admin/permissions/databases/${databaseId}/schemas/${
                    schemas[0]
                  }/tables`,
                );
              } else {
                return push(
                  `/admin/permissions/databases/${databaseId}/schemas`,
                );
              }
            }
          },
          confirm(groupId, entityId, value) {
            return [
              getPermissionWarningModal(
                getSchemasPermission,
                "schemas",
                defaultGroup,
                permissions,
                groupId,
                entityId,
                value,
              ),
            ];
          },
          warning(groupId, entityId) {
            return getPermissionWarning(
              getSchemasPermission,
              "schemas",
              defaultGroup,
              permissions,
              groupId,
              entityId,
            );
          },
        },
        native: {
          header: t`SQL Queries`,
          options(groupId, entityId) {
            if (
              getSchemasPermission(permissions, groupId, entityId) === "none"
            ) {
              return [OPTION_NONE];
            } else {
              return [OPTION_NATIVE_WRITE, OPTION_NONE];
            }
          },
          getter(groupId, entityId) {
            return getNativePermission(permissions, groupId, entityId);
          },
          updater(groupId, entityId, value) {
            MetabaseAnalytics.trackEvent("Permissions", "native", value);
            return updateNativePermission(
              permissions,
              groupId,
              entityId,
              value,
              metadata,
            );
          },
          confirm(groupId, entityId, value) {
            return [
              getPermissionWarningModal(
                getNativePermission,
                null,
                defaultGroup,
                permissions,
                groupId,
                entityId,
                value,
              ),
              getRawQueryWarningModal(permissions, groupId, entityId, value),
            ];
          },
          warning(groupId, entityId) {
            return getPermissionWarning(
              getNativePermission,
              null,
              defaultGroup,
              permissions,
              groupId,
              entityId,
            );
          },
        },
      },
      entities: databases.map(database => {
        let schemas = database.schemaNames();
        return {
          id: {
            databaseId: database.id,
          },
          name: database.name,
          link:
            schemas.length === 0 || (schemas.length === 1 && schemas[0] === "")
              ? {
                  name: t`View tables`,
                  url: `/admin/permissions/databases/${database.id}/tables`,
                }
              : schemas.length === 1
                ? {
                    name: t`View tables`,
                    url: `/admin/permissions/databases/${database.id}/schemas/${
                      schemas[0]
                    }/tables`,
                  }
                : {
                    name: t`View schemas`,
                    url: `/admin/permissions/databases/${database.id}/schemas`,
                  },
        };
      }),
    };
  },
);

import Collections from "metabase/entities/collections";

const getCollectionId = (state, props) => props && props.collectionId;
const getSingleCollectionPermissionsMode = (state, props) =>
  (props && props.singleCollectionMode) || false;

const getCollections = createSelector(
  [
    Collections.selectors.getExpandedCollectionsById,
    getCollectionId,
    getSingleCollectionPermissionsMode,
  ],
  (collectionsById, collectionId, singleMode) => {
    if (collectionId && collectionsById[collectionId]) {
      if (singleMode) {
        return [collectionsById[collectionId]];
      } else {
        return collectionsById[collectionId].children;
      }
    } else if (collectionsById["root"]) {
      return [collectionsById["root"]];
    } else {
      return null;
    }
  },
);
const getCollectionPermission = (permissions, groupId, { collectionId }) =>
  getIn(permissions, [groupId, collectionId]);

export const getCollectionsPermissionsGrid = createSelector(
  getCollections,
  getGroups,
  getPermissions,
  (collections, groups: Array<Group>, permissions: GroupsPermissions) => {
    if (!groups || groups.length === 0 || !permissions || !collections) {
      return null;
    }

    const defaultGroup = _.find(groups, isDefaultGroup);

    return {
      type: "collection",
      icon: "collection",
      groups,
      permissions: {
        access: {
          options(groupId, entityId) {
            return [
              OPTION_COLLECTION_WRITE,
              OPTION_COLLECTION_READ,
              OPTION_NONE,
            ];
          },
          getter(groupId, entityId) {
            return getCollectionPermission(permissions, groupId, entityId);
          },
          updater(groupId, { collectionId }, value) {
            return assocIn(permissions, [groupId, collectionId], value);
          },
          confirm(groupId, entityId, value) {
            return [
              getPermissionWarningModal(
                getCollectionPermission,
                null,
                defaultGroup,
                permissions,
                groupId,
                entityId,
                value,
              ),
            ];
          },
          warning(groupId, entityId) {
            return getPermissionWarning(
              getCollectionPermission,
              null,
              defaultGroup,
              permissions,
              groupId,
              entityId,
            );
          },
        },
      },
      entities: collections.map(collection => {
        return {
          id: {
            collectionId: collection.id,
          },
          name: collection.name,
          link: collection.children &&
            collection.children.length > 0 && {
              name: t`View collections`,
              url: `/collections/permissions?collectionId=${collection.id}`,
            },
        };
      }),
    };
  },
);

export const getDiff = createSelector(
  getMetadata,
  getGroups,
  getPermissions,
  getOriginalPermissions,
  (
    metadata: Metadata,
    groups: Array<Group>,
    permissions: GroupsPermissions,
    originalPermissions: GroupsPermissions,
  ) => diffPermissions(permissions, originalPermissions, groups, metadata),
);
