import { createSelector } from "reselect";
import { msgid, ngettext, t } from "ttag";
import _ from "underscore";
import { push } from "react-router-redux";

import { getMetadata } from "metabase/selectors/metadata";

import Group from "metabase/entities/groups";
import {
  isAdminGroup,
  isDefaultGroup,
  isMetaBotGroup,
} from "metabase/lib/groups";
import { DATA_PERMISSION_OPTIONS } from "../constants/data-permissions";
import {
  getFieldsPermission,
  getNativePermission,
  getSchemasPermission,
  getTablesPermission,
  diffPermissions,
} from "metabase/lib/permissions";
import {
  DATA_ACCESS_IS_REQUIRED,
  UNABLE_TO_CHANGE_ADMIN_PERMISSIONS,
} from "../constants/messages";
import {
  PLUGIN_ADMIN_PERMISSIONS_TABLE_FIELDS_ACTIONS,
  PLUGIN_ADMIN_PERMISSIONS_TABLE_FIELDS_OPTIONS,
  PLUGIN_ADMIN_PERMISSIONS_TABLE_FIELDS_POST_ACTION,
} from "metabase/plugins";
import {
  getPermissionWarning,
  getPermissionWarningModal,
  getControlledDatabaseWarningModal,
  getRawQueryWarningModal,
  getRevokingAccessToAllTablesWarningModal,
} from "./confirmations";

export const getIsDirty = createSelector(
  state => state.admin.permissions.dataPermissions,
  state => state.admin.permissions.originalDataPermissions,
  (permissions, originalPermissions) =>
    JSON.stringify(permissions) !== JSON.stringify(originalPermissions),
);

export const getDiff = createSelector(
  getMetadata,
  Group.selectors.getList,
  state => state.admin.permissions.dataPermissions,
  state => state.admin.permissions.originalDataPermissions,
  (metadata, groups, permissions, originalPermissions) =>
    diffPermissions(permissions, originalPermissions, groups, metadata),
);

const getRouteParams = (_state, props) => {
  const { databaseId, schemaName, tableId } = props.params;
  return {
    databaseId,
    schemaName,
    tableId,
  };
};

const getEntitySwitch = value => ({
  value,
  options: [
    {
      name: t`Groups`,
      value: "group",
    },
    {
      name: t`Databases`,
      value: "database",
    },
  ],
});

const getSchemaId = name => `schema:${name}`;
const getTableId = id => `table:${id}`;

export const getDatabasesSidebar = createSelector(
  getMetadata,
  getRouteParams,
  (metadata, params) => {
    const { databaseId, schemaName, tableId } = params;

    if (databaseId == null) {
      const entities = Object.values(metadata.databases).map(database => ({
        ...database,
        icon: "database",
        type: "database",
      }));

      return {
        entityGroups: [entities],
        entitySwitch: getEntitySwitch("database"),
        filterPlaceholder: t`Search for a database`,
      };
    }

    const database = metadata.databases[databaseId];

    let selectedId = null;

    if (tableId != null) {
      selectedId = getTableId(tableId);
    } else if (schemaName != null) {
      selectedId = getSchemaId(schemaName);
    }

    let entities = database.schemas.map(schema => {
      return {
        id: getSchemaId(schema.name),
        name: schema.name,
        databaseId: databaseId,
        type: "schema",
        children: schema.tables.map(table => ({
          id: getTableId(table.id),
          originalId: table.id,
          name: table.name,
          schemaName: schema.name,
          databaseId: databaseId,
          type: "table",
        })),
      };
    });

    const shouldIncludeSchemas = database.schemas.length > 1;
    if (!shouldIncludeSchemas) {
      entities = entities[0].children;
    }

    return {
      selectedId,
      title: database.name,
      description: t`Select a table to set more specific permissions`,
      entityGroups: [entities],
      filterPlaceholder: t`Search for a table`,
    };
  },
);

const getBreadcrumbs = (params, metadata) => {
  const { databaseId, schemaName, tableId } = params;

  if (databaseId == null) {
    return null;
  }

  const database = metadata.database(databaseId);

  const databaseItem = {
    text: database.name,
    id: databaseId,
    type: "database",
  };

  if (schemaName == null) {
    return [databaseItem];
  }

  const schema = metadata.schema(`${databaseId}:${schemaName}`);
  const schemaItem = {
    id: schema.id,
    text: schema.name,
    name: schema.name,
    databaseId,
    type: "schema",
  };

  const hasMultipleSchemas = database.schemas.length > 1;

  if (tableId == null) {
    return [databaseItem, hasMultipleSchemas && schemaItem].filter(Boolean);
  }

  const table = metadata.table(tableId);
  const tableItem = {
    text: table.name,
    type: "table",
    schemaName: schema.name,
    databaseId,
    originalId: table.id,
  };

  return [databaseItem, hasMultipleSchemas && schemaItem, tableItem].filter(
    Boolean,
  );
};

export const getGroupsWithoutMetabot = createSelector(
  [Group.selectors.getList],
  groups => groups.filter(group => !isMetaBotGroup(group)),
);

const getDataPermissions = state => state.admin.permissions.dataPermissions;

const buildFieldsPermissions = (
  entityId,
  groupId,
  isAdmin,
  permissions,
  defaultGroup,
  database,
) => {
  const value = getFieldsPermission(permissions, groupId, entityId);
  const defaultGroupValue = getFieldsPermission(
    permissions,
    defaultGroup.id,
    entityId,
  );

  const warning = getPermissionWarning(
    value,
    defaultGroupValue,
    "fields",
    defaultGroup,
    groupId,
  );

  const confirmations = newValue => [
    getPermissionWarningModal(
      newValue,
      defaultGroupValue,
      "fields",
      defaultGroup,
      groupId,
    ),
    getControlledDatabaseWarningModal(permissions, groupId, entityId),
    getRevokingAccessToAllTablesWarningModal(
      database,
      permissions,
      groupId,
      entityId,
      newValue,
    ),
  ];

  return [
    {
      name: "access",
      isDisabled: isAdmin,
      disabledTooltip: isAdmin ? UNABLE_TO_CHANGE_ADMIN_PERMISSIONS : null,
      value,
      warning,
      options: [
        DATA_PERMISSION_OPTIONS.all,
        ...PLUGIN_ADMIN_PERMISSIONS_TABLE_FIELDS_OPTIONS,
        DATA_PERMISSION_OPTIONS.none,
      ],
      actions: PLUGIN_ADMIN_PERMISSIONS_TABLE_FIELDS_ACTIONS,
      postActions: PLUGIN_ADMIN_PERMISSIONS_TABLE_FIELDS_POST_ACTION,
      confirmations,
    },
  ];
};

const buildTablesPermissions = (
  entityId,
  groupId,
  isAdmin,
  permissions,
  defaultGroup,
) => {
  const value = getTablesPermission(permissions, groupId, entityId);
  const defaultGroupValue = getTablesPermission(
    permissions,
    defaultGroup.id,
    entityId,
  );

  const warning = getPermissionWarning(
    value,
    defaultGroupValue,
    "tables",
    defaultGroup,
    groupId,
  );

  const confirmations = newValue => [
    getPermissionWarningModal(
      newValue,
      defaultGroupValue,
      "tables",
      defaultGroup,
      groupId,
    ),
    getControlledDatabaseWarningModal(permissions, groupId, entityId),
  ];

  return [
    {
      name: "access",
      isDisabled: isAdmin,
      disabledTooltip: isAdmin ? UNABLE_TO_CHANGE_ADMIN_PERMISSIONS : null,
      value,
      warning,
      confirmations,
      postActions: {
        controlled: () =>
          push(
            `/admin/permissions/data/group/${groupId}/database/${entityId.databaseId}/schema/${entityId.schemaName}`,
          ),
      },
      options: [
        DATA_PERMISSION_OPTIONS.all,
        DATA_PERMISSION_OPTIONS.controlled,
        DATA_PERMISSION_OPTIONS.none,
      ],
    },
  ];
};

const buildDatabasePermissions = (
  entityId,
  groupId,
  isAdmin,
  permissions,
  defaultGroup,
  database,
) => {
  const accessPermissionValue = getSchemasPermission(
    permissions,
    groupId,
    entityId,
  );
  const defaultGroupAccessPermissionValue = getTablesPermission(
    permissions,
    defaultGroup.id,
    entityId,
  );
  const accessPermissionWarning = getPermissionWarning(
    accessPermissionValue,
    defaultGroupAccessPermissionValue,
    "schemas",
    defaultGroup,
    groupId,
  );

  const accessPermissionConfirmations = newValue => [
    getPermissionWarningModal(
      newValue,
      defaultGroupAccessPermissionValue,
      "schemas",
      defaultGroup,
      groupId,
    ),
  ];

  const nativePermissionValue = getNativePermission(
    permissions,
    groupId,
    entityId,
  );

  const defaultGroupNativePermissionValue = getNativePermission(
    permissions,
    defaultGroup.id,
    entityId,
  );
  const nativePermissionWarning = getPermissionWarning(
    nativePermissionValue,
    defaultGroupNativePermissionValue,
    null,
    defaultGroup,
    groupId,
  );

  const nativePermissionConfirmations = newValue => [
    getPermissionWarningModal(
      newValue,
      defaultGroupNativePermissionValue,
      null,
      defaultGroup,
      groupId,
    ),
    getRawQueryWarningModal(permissions, groupId, entityId, newValue),
  ];

  let controlledPostActionUrl = `/admin/permissions/data/group/${groupId}/database/${entityId.databaseId}`;
  const hasSingleSchema = database.schemas.length === 1;
  if (hasSingleSchema) {
    controlledPostActionUrl += `/schema/${database.schemas[0].name}`;
  }

  return [
    {
      name: "access",
      isDisabled: isAdmin,
      disabledTooltip: isAdmin ? UNABLE_TO_CHANGE_ADMIN_PERMISSIONS : null,
      value: accessPermissionValue,
      warning: accessPermissionWarning,
      confirmations: accessPermissionConfirmations,
      options: [
        DATA_PERMISSION_OPTIONS.all,
        DATA_PERMISSION_OPTIONS.controlled,
        DATA_PERMISSION_OPTIONS.none,
      ],
      postActions: {
        controlled: () => push(controlledPostActionUrl),
      },
    },
    {
      name: "native",
      isDisabled: isAdmin || accessPermissionValue === "none",
      disabledTooltip: isAdmin
        ? UNABLE_TO_CHANGE_ADMIN_PERMISSIONS
        : DATA_ACCESS_IS_REQUIRED,
      value: nativePermissionValue,
      warning: nativePermissionWarning,
      confirmations: nativePermissionConfirmations,
      options: [DATA_PERMISSION_OPTIONS.write, DATA_PERMISSION_OPTIONS.none],
    },
  ];
};

export const getGroupsDataPermissionEditor = createSelector(
  getMetadata,
  getRouteParams,
  getDataPermissions,
  getGroupsWithoutMetabot,
  (metadata, params, permissions, groups) => {
    const { databaseId, schemaName, tableId } = params;

    if (!permissions || databaseId == null) {
      return null;
    }

    const defaultGroup = _.find(groups, isDefaultGroup);

    const isDatabaseLevelPermission = tableId == null && schemaName == null;
    const columns = [
      t`Group name`,
      t`Data access`,
      isDatabaseLevelPermission ? t`SQL queries` : null,
    ].filter(Boolean);

    const entities = groups.map(group => {
      const isAdmin = isAdminGroup(group);
      let groupPermissions;

      if (tableId != null) {
        groupPermissions = buildFieldsPermissions(
          {
            databaseId,
            schemaName,
            tableId,
          },
          group.id,
          isAdmin,
          permissions,
          defaultGroup,
          metadata.database(databaseId),
        );
      } else if (schemaName != null) {
        groupPermissions = buildTablesPermissions(
          {
            databaseId,
            schemaName,
          },
          group.id,
          isAdmin,
          permissions,
          defaultGroup,
        );
      } else if (databaseId != null) {
        groupPermissions = buildDatabasePermissions(
          {
            databaseId,
          },
          group.id,
          isAdmin,
          permissions,
          defaultGroup,
          metadata.database(databaseId),
        );
      }

      return {
        id: group.id,
        name: group.name,
        permissions: groupPermissions,
      };
    });

    return {
      title: t`Permissions for`,
      filterPlaceholder: t`Search groups`,
      breadcrumbs: getBreadcrumbs(params, metadata),
      columns,
      entities,
    };
  },
);

const getGroupRouteParams = (_state, props) => {
  const { groupId, databaseId, schemaName } = props.params;
  return {
    groupId,
    databaseId,
    schemaName,
  };
};

const isPinnedGroup = group =>
  isAdminGroup(group) || isDefaultGroup(group) || isMetaBotGroup(group);

export const getGroupsSidebar = createSelector(
  Group.selectors.getList,
  getGroupRouteParams,
  (groups, params) => {
    const { groupId } = params;

    const [pinnedGroups, unpinnedGroups] = _.partition(groups, isPinnedGroup);

    const pinnedGroupItems = pinnedGroups.map(group => ({
      ...group,
      icon: "bolt",
    }));

    const unpinnedGroupItems = unpinnedGroups.map(group => ({
      ...group,
      icon: "group",
    }));

    return {
      selectedId: parseInt(groupId),
      entityGroups: [pinnedGroupItems, unpinnedGroupItems],
      entitySwitch: getEntitySwitch("group"),
      filterPlaceholder: t`Search for a group`,
    };
  },
);

const getEditorEntityName = ({ databaseId, schemaName }) => {
  if (schemaName != null) {
    return t`Table name`;
  } else if (databaseId) {
    return t`Schema name`;
  } else {
    return t`Database name`;
  }
};

const getFilterPlaceholder = ({ databaseId, schemaName }) => {
  if (schemaName != null) {
    return t`Search tables`;
  } else if (databaseId) {
    return t`Search schemas`;
  } else {
    return t`Search databases`;
  }
};

export const getGroup = (state, props) =>
  Group.selectors.getObject(state, { entityId: props.params.groupId });

export const getDatabasesPermissionEditor = createSelector(
  getMetadata,
  getGroupRouteParams,
  getDataPermissions,
  getGroup,
  getGroupsWithoutMetabot,
  (metadata, params, permissions, group, groups) => {
    const { groupId, databaseId, schemaName } = params;

    if (!permissions || groupId == null) {
      return null;
    }

    const isAdmin = isAdminGroup(group);

    let entities = [];

    const isDatabaseLevelPermission = schemaName == null && databaseId == null;
    const columns = [
      getEditorEntityName(params),
      t`Data access`,
      isDatabaseLevelPermission ? t`SQL queries` : null,
    ].filter(Boolean);

    const defaultGroup = _.find(groups, isDefaultGroup);

    if (schemaName != null) {
      entities = metadata
        .schema(`${databaseId}:${schemaName}`)
        .tables.map(table => {
          return {
            id: table.id,
            name: table.name,
            type: "table",
            permissions: buildFieldsPermissions(
              {
                databaseId,
                schemaName,
                tableId: table.id,
              },
              groupId,
              isAdmin,
              permissions,
              defaultGroup,
              metadata.database(databaseId),
            ),
          };
        });
    } else if (databaseId != null) {
      entities = metadata.database(databaseId).schemas.map(schema => {
        return {
          id: schema.id,
          name: schema.name,
          type: "schema",
          permissions: buildTablesPermissions(
            {
              databaseId,
              schemaName: schema.name,
            },
            groupId,
            isAdmin,
            permissions,
            defaultGroup,
          ),
        };
      });
    } else if (groupId != null) {
      entities = metadata
        .databasesList({ savedQuestions: false })
        .map(database => {
          return {
            id: database.id,
            name: database.name,
            type: "database",
            schemas: database.schemas,
            permissions: buildDatabasePermissions(
              {
                databaseId: database.id,
              },
              groupId,
              isAdmin,
              permissions,
              defaultGroup,
              database,
            ),
          };
        });
    }

    const breadcrumbs = getBreadcrumbs(params, metadata);
    let title = t`Permissions for the ${group.name} group`;
    if (breadcrumbs?.length > 0) {
      title += " - ";
    }

    return {
      title,
      breadcrumbs,
      description:
        group != null
          ? ngettext(
              msgid`${group.member_count} person`,
              `${group.member_count} people`,
              group.member_count,
            )
          : null,
      filterPlaceholder: getFilterPlaceholder(params),
      columns,
      entities,
    };
  },
);
