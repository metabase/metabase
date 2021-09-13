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
  isRestrictivePermission,
  isBlockPermission,
} from "metabase/lib/permissions";
import {
  DATA_ACCESS_IS_REQUIRED,
  UNABLE_TO_CHANGE_ADMIN_PERMISSIONS,
} from "../constants/messages";
import {
  PLUGIN_ADMIN_PERMISSIONS_DATABASE_BLOCK_OPTIONS,
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
import {
  getTableEntityId,
  getSchemaEntityId,
  getDatabaseEntityId,
} from "../utils/data-entity-id";
import {
  getDatabaseFocusPermissionsUrl,
  getGroupFocusPermissionsUrl,
} from "../utils/urls";
import { limitDatabasePermission } from "../permissions";

const getGroupsWithoutMetabot = createSelector(
  Group.selectors.getList,
  groups => groups.filter(group => !isMetaBotGroup(group)),
);

export const getIsDirty = createSelector(
  state => state.admin.permissions.dataPermissions,
  state => state.admin.permissions.originalDataPermissions,
  (permissions, originalPermissions) =>
    JSON.stringify(permissions) !== JSON.stringify(originalPermissions),
);

export const getDiff = createSelector(
  getMetadata,
  getGroupsWithoutMetabot,
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
      const entities = Object.values(metadata.databases)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(database => ({
          id: database.id,
          name: database.name,
          entityId: getDatabaseEntityId(database),
          icon: "database",
        }));

      return {
        entityGroups: [entities],
        entitySwitch: getEntitySwitch("database"),
        filterPlaceholder: t`Search for a database`,
      };
    }

    const database = metadata.database(databaseId);

    let selectedId = null;

    if (tableId != null) {
      selectedId = getTableId(tableId);
    } else if (schemaName != null) {
      selectedId = getSchemaId(schemaName);
    }

    let entities = database
      .getSchemas()
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(schema => {
        return {
          id: getSchemaId(schema.name),
          name: schema.name,
          entityId: getSchemaEntityId(schema),
          icon: "folder",
          children: schema
            .getTables()
            .sort((a, b) => a.displayName().localeCompare(b.displayName()))
            .map(table => ({
              id: getTableId(table.id),
              entityId: getTableEntityId(table),
              name: table.displayName(),
              icon: "table",
            })),
        };
      });

    const shouldIncludeSchemas = database.schemasCount() > 1;
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

const getGroupsDataEditorBreadcrumbs = (params, metadata) => {
  const { databaseId, schemaName, tableId } = params;

  if (databaseId == null) {
    return null;
  }

  const database = metadata.database(databaseId);

  const databaseItem = {
    text: database.name,
    id: databaseId,
    url: getDatabaseFocusPermissionsUrl(getDatabaseEntityId(database)),
  };

  if (schemaName == null && tableId == null) {
    return [databaseItem];
  }

  const schema = database.schema(schemaName);
  const schemaItem = {
    id: schema.id,
    text: schema.name,
    url: getDatabaseFocusPermissionsUrl(getSchemaEntityId(schema)),
  };

  const hasMultipleSchemas = database.schemasCount() > 1;

  if (tableId == null) {
    return [databaseItem, hasMultipleSchemas && schemaItem].filter(Boolean);
  }

  const table = metadata.table(tableId);
  const tableItem = {
    id: table.id,
    text: table.display_name,
  };

  return [databaseItem, hasMultipleSchemas && schemaItem, tableItem].filter(
    Boolean,
  );
};

const getDataPermissions = state => state.admin.permissions.dataPermissions;

const NATIVE_QUERIES_OPTIONS = [
  DATA_PERMISSION_OPTIONS.write,
  DATA_PERMISSION_OPTIONS.none,
];

const shouldIncludeRestrictivePluginOptions = value =>
  PLUGIN_ADMIN_PERMISSIONS_DATABASE_BLOCK_OPTIONS.some(
    option => option.value === value,
  );

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
      isDisabled: isAdmin || isBlockPermission(value),
      disabledTooltip: isAdmin ? UNABLE_TO_CHANGE_ADMIN_PERMISSIONS : null,
      isHighlighted: isAdmin,
      value,
      warning,
      options: [
        DATA_PERMISSION_OPTIONS.all,
        ...PLUGIN_ADMIN_PERMISSIONS_TABLE_FIELDS_OPTIONS,
        DATA_PERMISSION_OPTIONS.noSelfService,
        ...(shouldIncludeRestrictivePluginOptions(value)
          ? PLUGIN_ADMIN_PERMISSIONS_DATABASE_BLOCK_OPTIONS
          : []),
      ],
      actions: PLUGIN_ADMIN_PERMISSIONS_TABLE_FIELDS_ACTIONS,
      postActions: PLUGIN_ADMIN_PERMISSIONS_TABLE_FIELDS_POST_ACTION,
      confirmations,
    },
    {
      name: "native",
      isDisabled: true,
      disabledTooltip: isAdmin
        ? UNABLE_TO_CHANGE_ADMIN_PERMISSIONS
        : DATA_ACCESS_IS_REQUIRED,
      isHighlighted: isAdmin,
      value: getNativePermission(permissions, groupId, entityId),
      options: NATIVE_QUERIES_OPTIONS,
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
      isDisabled: isAdmin || isBlockPermission(value),
      isHighlighted: isAdmin,
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
        DATA_PERMISSION_OPTIONS.noSelfService,
        ...(shouldIncludeRestrictivePluginOptions(value)
          ? PLUGIN_ADMIN_PERMISSIONS_DATABASE_BLOCK_OPTIONS
          : []),
      ],
    },
    {
      name: "native",
      isDisabled: true,
      disabledTooltip: isAdmin
        ? UNABLE_TO_CHANGE_ADMIN_PERMISSIONS
        : DATA_ACCESS_IS_REQUIRED,
      isHighlighted: isAdmin,
      value: getNativePermission(permissions, groupId, entityId),
      options: NATIVE_QUERIES_OPTIONS,
    },
  ];
};

const buildSchemasPermissions = (
  entityId,
  groupId,
  isAdmin,
  permissions,
  defaultGroup,
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

  const isNativePermissionDisabled =
    isAdmin || isRestrictivePermission(accessPermissionValue);

  return [
    {
      name: "access",
      isDisabled: isAdmin,
      disabledTooltip: isAdmin ? UNABLE_TO_CHANGE_ADMIN_PERMISSIONS : null,
      isHighlighted: isAdmin,
      value: accessPermissionValue,
      warning: accessPermissionWarning,
      confirmations: accessPermissionConfirmations,
      options: [
        DATA_PERMISSION_OPTIONS.all,
        DATA_PERMISSION_OPTIONS.controlled,
        DATA_PERMISSION_OPTIONS.noSelfService,
        ...PLUGIN_ADMIN_PERMISSIONS_DATABASE_BLOCK_OPTIONS,
      ],
      postActions: {
        controlled: () =>
          limitDatabasePermission(
            groupId,
            entityId,
            isBlockPermission(accessPermissionValue)
              ? DATA_PERMISSION_OPTIONS.noSelfService.value
              : null,
          ),
      },
    },
    {
      name: "native",
      isDisabled: isNativePermissionDisabled,
      disabledTooltip: isAdmin
        ? UNABLE_TO_CHANGE_ADMIN_PERMISSIONS
        : DATA_ACCESS_IS_REQUIRED,
      isHighlighted: isAdmin,
      value: nativePermissionValue,
      warning: nativePermissionWarning,
      confirmations: nativePermissionConfirmations,
      options: NATIVE_QUERIES_OPTIONS,
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

    const columns = [t`Group name`, t`Data access`, t`Native query editing`];

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
        groupPermissions = buildSchemasPermissions(
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
        hint: isAdmin
          ? t`The Administrators group is special, and always has Unrestricted access.`
          : null,
        entityId: params,
        permissions: groupPermissions,
      };
    });

    return {
      title: t`Permissions for`,
      filterPlaceholder: t`Search for a group`,
      breadcrumbs: getGroupsDataEditorBreadcrumbs(params, metadata),
      columns,
      entities,
    };
  },
);

const getGroupRouteParams = (_state, props) => {
  const { groupId, databaseId, schemaName } = props.params;
  return {
    groupId: groupId != null ? parseInt(groupId) : null,
    databaseId,
    schemaName,
  };
};

const isPinnedGroup = group =>
  isAdminGroup(group) || isDefaultGroup(group) || isMetaBotGroup(group);

export const getGroupsSidebar = createSelector(
  getGroupsWithoutMetabot,
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

const getEditorEntityName = ({ databaseId, schemaName }, hasSingleSchema) => {
  if (schemaName != null || hasSingleSchema) {
    return t`Table name`;
  } else if (databaseId) {
    return t`Schema name`;
  } else {
    return t`Database name`;
  }
};

const getFilterPlaceholder = ({ databaseId, schemaName }, hasSingleSchema) => {
  if (schemaName != null || hasSingleSchema) {
    return t`Search for a table`;
  } else if (databaseId) {
    return t`Search for a schema`;
  } else {
    return t`Search for a database`;
  }
};

const getGroup = (state, props) =>
  Group.selectors.getObject(state, {
    entityId: parseInt(props.params.groupId),
  });

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
    const defaultGroup = _.find(groups, isDefaultGroup);
    const hasSingleSchema =
      databaseId != null &&
      metadata.database(databaseId).getSchemas().length === 1;

    const columns = [
      getEditorEntityName(params, hasSingleSchema),
      t`Data access`,
      t`Native query editing`,
    ];

    let entities = [];

    if (schemaName != null || hasSingleSchema) {
      const schema = hasSingleSchema
        ? metadata.database(databaseId).getSchemas()[0]
        : metadata.database(databaseId).schema(schemaName);

      entities = schema.getTables().map(table => {
        const entityId = getTableEntityId(table);
        return {
          id: table.id,
          name: table.display_name,
          entityId,
          permissions: buildFieldsPermissions(
            entityId,
            groupId,
            isAdmin,
            permissions,
            defaultGroup,
            metadata.database(databaseId),
          ),
        };
      });
    } else if (databaseId != null) {
      entities = metadata
        .database(databaseId)
        .getSchemas()
        .map(schema => {
          const entityId = getSchemaEntityId(schema);
          return {
            id: schema.id,
            name: schema.name,
            entityId,
            canSelect: true,
            permissions: buildTablesPermissions(
              entityId,
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
          const entityId = getDatabaseEntityId(database);
          return {
            id: database.id,
            name: database.name,
            entityId,
            canSelect: true,
            permissions: buildSchemasPermissions(
              entityId,
              groupId,
              isAdmin,
              permissions,
              defaultGroup,
              database,
            ),
          };
        });
    }

    const breadcrumbs = getDatabasesEditorBreadcrumbs(params, metadata, group);
    const title = t`Permissions for the `;

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
      filterPlaceholder: getFilterPlaceholder(params, hasSingleSchema),
      columns,
      entities,
    };
  },
);

const getDatabasesEditorBreadcrumbs = (params, metadata, group) => {
  const { groupId, databaseId, schemaName } = params;

  if (groupId == null) {
    return null;
  }

  const groupItem = {
    id: group.id,
    text: `${group.name} group`,
    url: getGroupFocusPermissionsUrl(group.id),
  };

  if (databaseId == null) {
    return [groupItem];
  }

  const database = metadata.database(databaseId);
  const databaseItem = {
    id: database.id,
    text: database.name,
    url: getGroupFocusPermissionsUrl(group.id, getDatabaseEntityId(database)),
  };

  if (schemaName == null) {
    return [groupItem, databaseItem];
  }

  const schema = database.schema(schemaName);
  const schemaItem = {
    id: schema.name,
    text: schema.name,
  };
  return [groupItem, databaseItem, schemaItem];
};
