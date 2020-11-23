/* @flow weak */

import { createSelector } from "reselect";

import { push } from "react-router-redux";

import TogglePropagateAction from "./containers/TogglePropagateAction";

import MetabaseAnalytics from "metabase/lib/analytics";
import { color, alpha } from "metabase/lib/colors";

import {
  PLUGIN_ADMIN_PERMISSIONS_TABLE_FIELDS_OPTIONS,
  PLUGIN_ADMIN_PERMISSIONS_TABLE_FIELDS_ACTIONS,
  PLUGIN_ADMIN_PERMISSIONS_TABLE_FIELDS_POST_ACTION,
} from "metabase/plugins";

import { t } from "ttag";

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
import {
  isDefaultGroup,
  isAdminGroup,
  isMetaBotGroup,
  canEditPermissions,
} from "metabase/lib/groups";

import Group from "metabase/entities/groups";

import { getMetadata } from "metabase/selectors/metadata";

import Metadata from "metabase-lib/lib/metadata/Metadata";
import type { DatabaseId } from "metabase-types/types/Database";
import type { SchemaName } from "metabase-types/types/Table";
import type {
  Group as GroupType,
  GroupsPermissions,
} from "metabase-types/types/Permissions";

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
  [Group.selectors.getList],
  groups => {
    const orderedGroups = groups ? [...groups] : [];
    for (const groupFilter of SPECIAL_GROUP_FILTERS) {
      const index = _.findIndex(orderedGroups, groupFilter);
      if (index >= 0) {
        orderedGroups.unshift(...orderedGroups.splice(index, 1));
      }
    }
    return orderedGroups.map(group => ({
      ...group,
      editable: canEditPermissions(group),
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
  const perm = value || getter(permissions, groupId, entityId);
  const defaultPerm = getter(permissions, defaultGroup.id, entityId);
  if (perm === "controlled" && defaultPerm === "controlled") {
    return t`The "${defaultGroup.name}" group may have access to a different set of ${entityType} than this group, which may give this group additional access to some ${entityType}.`;
  }
  if (hasGreaterPermissions(defaultPerm, perm)) {
    return t`The "${defaultGroup.name}" group has a higher level of access than this, which will override this setting. You should limit or revoke the "${defaultGroup.name}" group's access to this item.`;
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
  const permissionWarning = getPermissionWarning(
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
      schemaName: table.schema_name || "",
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

const BG_ALPHA = 0.15;

const OPTION_GREEN = {
  icon: "check",
  iconColor: color("success"),
  bgColor: alpha(color("success"), BG_ALPHA),
};
const OPTION_YELLOW = {
  icon: "eye",
  iconColor: color("warning"),
  bgColor: alpha(color("warning"), BG_ALPHA),
};
const OPTION_RED = {
  icon: "close",
  iconColor: color("error"),
  bgColor: alpha(color("error"), BG_ALPHA),
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
  icon: "permissions_limited",
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
  tooltip: t`Can edit this collection and its contents`,
};

const OPTION_COLLECTION_READ = {
  ...OPTION_YELLOW,
  value: "read",
  title: t`View collection`,
  tooltip: t`Can view items in this collection`,
};

const OPTION_SNIPPET_COLLECTION_WRITE = {
  ...OPTION_COLLECTION_WRITE,
  title: t`Grant Edit access`,
  tooltip: t`Can modify snippets in this folder`,
};

const OPTION_SNIPPET_COLLECTION_READ = {
  ...OPTION_COLLECTION_READ,
  title: t`Grant View access`,
  tooltip: t`Can insert and use snippets in this folder, but can't edit the SQL they contain`,
};

const OPTION_SNIPPET_COLLECTION_NONE = {
  ...OPTION_NONE,
  title: t`Revoke access`,
  tooltip: t`Can't view or insert snippets in this folder`,
};

export const getTablesPermissionsGrid = createSelector(
  getMetadata,
  getGroups,
  getPermissions,
  getDatabaseId,
  getSchemaName,
  (
    metadata: Metadata,
    groups: Array<GroupType>,
    permissions: GroupsPermissions,
    databaseId: DatabaseId,
    schemaName: SchemaName,
  ) => {
    const database = metadata.database(databaseId);

    if (!groups || !permissions || !database) {
      return null;
    }

    const tables = database.schema(schemaName).tables;
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
            return [
              OPTION_ALL,
              ...PLUGIN_ADMIN_PERMISSIONS_TABLE_FIELDS_OPTIONS,
              OPTION_NONE,
            ];
          },
          actions(groupId, entityId) {
            const value = getFieldsPermission(permissions, groupId, entityId);
            const getActions =
              PLUGIN_ADMIN_PERMISSIONS_TABLE_FIELDS_ACTIONS[value] || [];
            return getActions.map(getAction => getAction(groupId, entityId));
          },
          postAction(groupId, entityId, value) {
            const getPostAction =
              PLUGIN_ADMIN_PERMISSIONS_TABLE_FIELDS_POST_ACTION[value];
            return getPostAction && getPostAction(groupId, entityId);
          },
          getter(groupId, entityId) {
            return getFieldsPermission(permissions, groupId, entityId);
          },
          updater(groupId, entityId, value) {
            MetabaseAnalytics.trackEvent("Permissions", "fields", value);
            const updatedPermissions = updateFieldsPermission(
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
    groups: Array<GroupType>,
    permissions: GroupsPermissions,
    databaseId: DatabaseId,
  ) => {
    const database = metadata.database(databaseId);

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
            const updatedPermissions = updateTablesPermission(
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

export function getDatabaseTablesOrSchemasPath(database) {
  const schemas = database ? database.schemaNames() : [];

  return (
    "/admin/permissions/databases/" +
    // schema-less db
    (schemas.length === 1 && schemas[0] === null
      ? `${database.id}/tables`
      : // single schema, auto-select it
      schemas.length === 1
      ? `${database.id}/schemas/${schemas[0]}/tables`
      : // zero or multiple schemas so list them out
        `${database.id}/schemas`)
  );
}

export const getDatabasesPermissionsGrid = createSelector(
  getMetadata,
  getGroups,
  getPermissions,
  (
    metadata: Metadata,
    groups: Array<GroupType>,
    permissions: GroupsPermissions,
  ) => {
    if (!groups || !permissions || !metadata) {
      return null;
    }

    const databases = metadata.databasesList({ savedQuestions: false });
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
              const database = metadata.database(databaseId);
              return push(getDatabaseTablesOrSchemasPath(database));
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
        const schemas = database.schemaNames();
        return {
          id: {
            databaseId: database.id,
          },
          name: database.name,
          link:
            schemas.length === 0 || (schemas.length === 1 && schemas[0] == null)
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
import SnippetCollections from "metabase/entities/snippet-collections";

const getCollectionId = (state, props) => props && props.collectionId;

const getSingleCollectionPermissionsMode = (state, props) =>
  (props && props.singleCollectionMode) || false;

const permissionsCollectionFilter = collection => !collection.is_personal;

const getNamespace = (state, props) => props.namespace;

const getExpandedCollectionsById = (state, props) =>
  (props.namespace === "snippets"
    ? SnippetCollections
    : Collections
  ).selectors.getExpandedCollectionsById(state, props);

const getCollections = createSelector(
  [
    getExpandedCollectionsById,
    getCollectionId,
    getSingleCollectionPermissionsMode,
  ],
  (collectionsById, collectionId, singleMode) => {
    if (collectionId && collectionsById[collectionId]) {
      if (singleMode) {
        // pass the `singleCollectionMode=true` prop when we just want to show permissions for the provided collection, and not it's subcollections
        return [collectionsById[collectionId]];
      } else {
        return collectionsById[collectionId].children.filter(
          permissionsCollectionFilter,
        );
      }
      // default to root collection
    } else if (collectionsById["root"]) {
      return [collectionsById["root"]];
    } else {
      return null;
    }
  },
);
const getCollectionPermission = (permissions, groupId, { collectionId }) =>
  getIn(permissions, [groupId, collectionId]);

export const getPropagatePermissions = state =>
  state.admin.permissions.propagatePermissions;

export const getCollectionsPermissionsGrid = createSelector(
  getCollections,
  getGroups,
  getPermissions,
  getPropagatePermissions,
  getNamespace,
  (
    collections,
    groups: Array<GroupType>,
    permissions: GroupsPermissions,
    propagatePermissions: boolean,
    namespace: string,
  ) => {
    if (!groups || groups.length === 0 || !permissions || !collections) {
      return null;
    }

    const crumbs = [];
    let parent = collections[0] && collections[0].parent;
    if (parent) {
      while (parent) {
        if (crumbs.length > 0) {
          crumbs.unshift([
            parent.name,
            `/admin/permissions/collections/${parent.id}`,
          ]);
        } else {
          crumbs.unshift([parent.name]);
        }
        parent = parent.parent;
      }
      crumbs.unshift([t`Collections`, "/admin/permissions/collections"]);
    }

    const defaultGroup = _.find(groups, isDefaultGroup);

    return {
      type: "collection",
      icon: "collection",
      crumbs,
      groups,
      permissions: {
        access: {
          header: t`Collection Access`,
          options(groupId, entityId) {
            return namespace === "snippets"
              ? [
                  OPTION_SNIPPET_COLLECTION_WRITE,
                  OPTION_SNIPPET_COLLECTION_READ,
                  OPTION_SNIPPET_COLLECTION_NONE,
                ]
              : [OPTION_COLLECTION_WRITE, OPTION_COLLECTION_READ, OPTION_NONE];
          },
          actions(groupId, { collectionId }) {
            const collection = _.findWhere(collections, {
              id: collectionId,
            });
            if (collection && collection.children.length > 0) {
              return [
                () =>
                  TogglePropagateAction({
                    message:
                      namespace === "snippets"
                        ? t`Also change sub-folders`
                        : t`Also change sub-collections`,
                  }),
              ];
            } else {
              return [];
            }
          },
          getter(groupId, entityId) {
            return getCollectionPermission(permissions, groupId, entityId);
          },
          updater(groupId, { collectionId }, value) {
            let newPermissions = assocIn(
              permissions,
              [groupId, collectionId],
              value,
            );
            if (propagatePermissions) {
              const collection = _.findWhere(collections, {
                id: collectionId,
              });
              for (const descendent of getDecendentCollections(collection)) {
                newPermissions = assocIn(
                  newPermissions,
                  [groupId, descendent.id],
                  value,
                );
              }
            }
            return newPermissions;
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
            const collection = _.findWhere(collections, {
              id: entityId.collectionId,
            });
            if (!collection) {
              return;
            }
            const collectionPerm = getCollectionPermission(
              permissions,
              groupId,
              entityId,
            );
            const descendentCollections = getDecendentCollections(collection);
            const descendentPerms = getPermissionsSet(
              descendentCollections,
              permissions,
              groupId,
            );
            if (
              collectionPerm === "none" &&
              (descendentPerms.has("read") || descendentPerms.has("write"))
            ) {
              return t`This group has permission to view at least one subcollection of this collection.`;
            } else if (
              collectionPerm === "read" &&
              descendentPerms.has("write")
            ) {
              return t`This group has permission to edit at least one subcollection of this collection.`;
            }
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
              name: t`View sub-collections`,
              url: `/admin/permissions/collections/${collection.id}`,
            },
        };
      }),
    };
  },
);

function getDecendentCollections(collection) {
  const subCollections = collection.children.filter(
    permissionsCollectionFilter,
  );
  return subCollections.concat(...subCollections.map(getDecendentCollections));
}

function getPermissionsSet(collections, permissions, groupId) {
  const perms = collections.map(collection =>
    getCollectionPermission(permissions, groupId, {
      collectionId: collection.id,
    }),
  );
  return new Set(perms);
}

export const getDiff = createSelector(
  getMetadata,
  getGroups,
  getPermissions,
  getOriginalPermissions,
  (
    metadata: Metadata,
    groups: Array<GroupType>,
    permissions: GroupsPermissions,
    originalPermissions: GroupsPermissions,
  ) => diffPermissions(permissions, originalPermissions, groups, metadata),
);
