import _ from "underscore";

import {
  PLUGIN_ADMIN_PERMISSIONS_DATABASE_ACTIONS,
  PLUGIN_ADMIN_PERMISSIONS_DATABASE_POST_ACTIONS,
  PLUGIN_ADMIN_PERMISSIONS_TABLE_FIELDS_ACTIONS,
  PLUGIN_ADMIN_PERMISSIONS_TABLE_FIELDS_CONFIRMATIONS,
  PLUGIN_ADMIN_PERMISSIONS_TABLE_FIELDS_OPTIONS,
  PLUGIN_ADMIN_PERMISSIONS_TABLE_FIELDS_POST_ACTION,
  PLUGIN_ADMIN_PERMISSIONS_TABLE_OPTIONS,
  PLUGIN_ADVANCED_PERMISSIONS,
  PLUGIN_FEATURE_LEVEL_PERMISSIONS,
} from "metabase/plugins";
import {
  DataPermission,
  DataPermissionType,
  DataPermissionValue,
  type DatabaseEntityId,
  type GroupInfo,
  type GroupsPermissions,
  type PermissionsDatabase,
  type SchemaEntityId,
  type SpecialGroupType,
  type TableEntityId,
} from "metabase-types/api";

import { DATA_PERMISSION_OPTIONS } from "../constants/data-permissions";
import { Messages } from "../constants/messages";
import type { PermissionSectionConfig } from "../types";

import {
  getBlockWarning,
  getPermissionWarning,
  getPermissionWarningModal,
  getRevokingAccessToAllTablesWarningModal,
  getViewDataPermissionsTooRestrictiveWarningModal,
  getWillRevokeNativeAccessWarningModal,
} from "./confirmations";
import {
  getFieldsPermission,
  getSchemasPermission,
  getTablesPermission,
  isRestrictivePermission,
} from "./graph";
import {
  limitDatabasePermission,
  navigateToGranularPermissions,
} from "./post-actions";

export const getNativePermissionDisabledTooltip = (
  isAdmin: boolean,
  accessPermissionValue: DataPermissionValue,
) => {
  if (isAdmin) {
    return Messages.UNABLE_TO_CHANGE_ADMIN_PERMISSIONS;
  }

  // prevent tooltip from being disabled when the user can't modify the view data column
  if (!PLUGIN_ADVANCED_PERMISSIONS.shouldShowViewDataColumn) {
    return null;
  }

  if (accessPermissionValue === DataPermissionValue.LEGACY_NO_SELF_SERVICE) {
    return Messages.UNABLE_TO_CHANGE_LEGACY_PERMISSIONS;
  }

  if (isRestrictivePermission(accessPermissionValue)) {
    return Messages.NATIVE_PERMISSION_REQUIRES_DATA_ACCESS;
  }

  return null;
};

const buildSchemasAccessPermission = (
  entityId: DatabaseEntityId,
  groupId: number,
  isAdmin: boolean,
  permissions: GroupsPermissions,
  originalPermissions: GroupsPermissions,
  defaultGroup: GroupInfo,
  database: PermissionsDatabase,
): PermissionSectionConfig => {
  const accessPermissionConfirmations = (newValue: DataPermissionValue) => [
    getPermissionWarningModal(
      newValue,
      defaultGroupAccessPermissionValue,
      "schemas",
      defaultGroup,
      groupId,
    ),
  ];

  const accessPermissionValue = getSchemasPermission(
    permissions,
    groupId,
    entityId,
    DataPermission.VIEW_DATA,
  );
  const originalAccessPermissionValue = getSchemasPermission(
    originalPermissions,
    groupId,
    entityId,
    DataPermission.VIEW_DATA,
  );
  const defaultGroupAccessPermissionValue = getSchemasPermission(
    permissions,
    defaultGroup.id,
    entityId,
    DataPermission.VIEW_DATA,
  );
  const accessPermissionWarning = getPermissionWarning(
    accessPermissionValue,
    defaultGroupAccessPermissionValue,
    "schemas",
    defaultGroup,
    groupId,
  );

  const baseOptions = [
    DATA_PERMISSION_OPTIONS.unrestricted,
    DATA_PERMISSION_OPTIONS.controlled,
  ];
  const options = PLUGIN_ADVANCED_PERMISSIONS.addDatabasePermissionOptions(
    _.compact([
      ...baseOptions,
      originalAccessPermissionValue ===
        DATA_PERMISSION_OPTIONS.noSelfServiceDeprecated.value &&
        DATA_PERMISSION_OPTIONS.noSelfServiceDeprecated,
    ]),
    database,
  );

  // remove granular in the cases we can't provide configurability for schemas/tables
  const shouldRemoveGranularOption = _.isEqual(options, baseOptions);
  if (shouldRemoveGranularOption) {
    options.pop();
  }

  return {
    permission: DataPermission.VIEW_DATA,
    type: DataPermissionType.ACCESS,
    isDisabled: isAdmin,
    disabledTooltip: isAdmin
      ? Messages.UNABLE_TO_CHANGE_ADMIN_PERMISSIONS
      : null,
    isHighlighted: isAdmin,
    value: accessPermissionValue,
    warning: accessPermissionWarning,
    confirmations: accessPermissionConfirmations,
    options,
    postActions: {
      controlled: limitDatabasePermission(
        groupId,
        entityId,
        accessPermissionValue,
      ),
      ...PLUGIN_ADMIN_PERMISSIONS_DATABASE_POST_ACTIONS,
    },
    actions: PLUGIN_ADMIN_PERMISSIONS_DATABASE_ACTIONS,
  };
};

const buildSchemasNativePermission = (
  entityId: DatabaseEntityId,
  groupId: number,
  isAdmin: boolean,
  permissions: GroupsPermissions,
  defaultGroup: GroupInfo,
  database: PermissionsDatabase,
  accessPermissionValue: DataPermissionValue,
): PermissionSectionConfig => {
  const value = getSchemasPermission(
    permissions,
    groupId,
    entityId,
    DataPermission.CREATE_QUERIES,
  );

  const defaultGroupNativePermissionValue = getSchemasPermission(
    permissions,
    defaultGroup.id,
    entityId,
    DataPermission.CREATE_QUERIES,
  );

  const disabledTooltip = getNativePermissionDisabledTooltip(
    isAdmin,
    accessPermissionValue,
  );

  const nativePermissionWarning = disabledTooltip
    ? ""
    : getPermissionWarning(
        value,
        defaultGroupNativePermissionValue,
        null,
        defaultGroup,
        groupId,
      );

  const nativePermissionConfirmations = (newValue: DataPermissionValue) => [
    getPermissionWarningModal(
      newValue,
      defaultGroupNativePermissionValue,
      null,
      defaultGroup,
      groupId,
    ),
    getViewDataPermissionsTooRestrictiveWarningModal(
      permissions,
      groupId,
      entityId,
      database,
      newValue,
    ),
  ];

  return {
    permission: DataPermission.CREATE_QUERIES,
    type: DataPermissionType.NATIVE,
    isDisabled: disabledTooltip != null,
    disabledTooltip,
    isHighlighted: isAdmin,
    value,
    warning: nativePermissionWarning,
    confirmations: nativePermissionConfirmations,
    options: [
      DATA_PERMISSION_OPTIONS.queryBuilderAndNative,
      DATA_PERMISSION_OPTIONS.queryBuilder,
      DATA_PERMISSION_OPTIONS.controlled,
      DATA_PERMISSION_OPTIONS.no,
    ],
    postActions: {
      controlled: () => navigateToGranularPermissions(groupId, entityId),
    },
  };
};

export const buildSchemasPermissions = ({
  entityId,
  groupId,
  groupType,
  permissions,
  originalPermissions,
  defaultGroup,
  database,
  permissionView,
  showTransformPermissions,
}: {
  entityId: DatabaseEntityId;
  groupId: number;
  groupType: SpecialGroupType;
  permissions: GroupsPermissions;
  originalPermissions: GroupsPermissions;
  defaultGroup: GroupInfo;
  database: PermissionsDatabase;
  permissionView: "group" | "database";
  showTransformPermissions: boolean;
}): PermissionSectionConfig[] => {
  const isAdmin = groupType === "admin";

  const accessPermission = buildSchemasAccessPermission(
    entityId,
    groupId,
    isAdmin,
    permissions,
    originalPermissions,
    defaultGroup,
    database,
  );

  const nativePermission = buildSchemasNativePermission(
    entityId,
    groupId,
    isAdmin,
    permissions,
    defaultGroup,
    database,
    accessPermission.value,
  );

  const hasAnyAccessOptions = accessPermission.options.length > 1;
  const shouldShowViewDataColumn =
    PLUGIN_ADVANCED_PERMISSIONS.shouldShowViewDataColumn && hasAnyAccessOptions;

  return _.compact([
    shouldShowViewDataColumn && accessPermission,
    nativePermission,
    ...PLUGIN_FEATURE_LEVEL_PERMISSIONS.getFeatureLevelDataPermissions({
      entityId,
      groupId,
      groupType,
      permissions,
      dataAccessPermissionValue: accessPermission.value,
      defaultGroup,
      permissionSubject: "schemas",
      permissionView,
      showTransformPermissions,
    }),
  ]);
};

const buildTablesAccessPermission = (
  entityId: SchemaEntityId,
  groupId: number,
  isAdmin: boolean,
  permissions: GroupsPermissions,
  originalPermissions: GroupsPermissions,
  defaultGroup: GroupInfo,
): PermissionSectionConfig => {
  const value = getTablesPermission(
    permissions,
    groupId,
    entityId,
    DataPermission.VIEW_DATA,
  );

  const originalValue = getTablesPermission(
    originalPermissions,
    groupId,
    entityId,
    DataPermission.VIEW_DATA,
  );

  const defaultGroupValue = getTablesPermission(
    permissions,
    defaultGroup.id,
    entityId,
    DataPermission.VIEW_DATA,
  );

  const dbValue = getSchemasPermission(
    permissions,
    groupId,
    entityId,
    DataPermission.VIEW_DATA,
  );

  const permissionWarning = getPermissionWarning(
    value,
    defaultGroupValue,
    "tables",
    defaultGroup,
    groupId,
  );

  const blockWarning = getBlockWarning(dbValue, value);

  // permissionWarning should always trump a blockWarning
  const warning = permissionWarning || blockWarning;

  const confirmations = (newValue: DataPermissionValue) => [
    getPermissionWarningModal(
      newValue,
      defaultGroupValue,
      "tables",
      defaultGroup,
      groupId,
    ),
  ];

  const options = PLUGIN_ADVANCED_PERMISSIONS.addSchemaPermissionOptions(
    _.compact([
      DATA_PERMISSION_OPTIONS.unrestricted,
      DATA_PERMISSION_OPTIONS.controlled,
      originalValue === DATA_PERMISSION_OPTIONS.noSelfServiceDeprecated.value &&
        DATA_PERMISSION_OPTIONS.noSelfServiceDeprecated,
      ...PLUGIN_ADMIN_PERMISSIONS_TABLE_OPTIONS,
    ]),
    value,
  );

  const isDisabled =
    isAdmin ||
    options.length <= 1 ||
    PLUGIN_ADVANCED_PERMISSIONS.isAccessPermissionDisabled(value, "tables");

  return {
    permission: DataPermission.VIEW_DATA,
    type: DataPermissionType.ACCESS,
    isDisabled,
    isHighlighted: isAdmin,
    disabledTooltip: isAdmin
      ? Messages.UNABLE_TO_CHANGE_ADMIN_PERMISSIONS
      : null,
    value,
    warning,
    confirmations,
    postActions: {
      controlled: () => navigateToGranularPermissions(groupId, entityId),
    },
    options,
  };
};

const buildTablesNativePermission = (
  entityId: SchemaEntityId,
  groupId: number,
  isAdmin: boolean,
  permissions: GroupsPermissions,
  accessPermissionValue: DataPermissionValue,
  database: PermissionsDatabase,
): PermissionSectionConfig => {
  const dbValue = getSchemasPermission(
    permissions,
    groupId,
    { databaseId: entityId.databaseId },
    DataPermission.CREATE_QUERIES,
  );

  const value = getTablesPermission(
    permissions,
    groupId,
    entityId,
    DataPermission.CREATE_QUERIES,
  );

  const disabledTooltip = getNativePermissionDisabledTooltip(
    isAdmin,
    accessPermissionValue,
  );

  return {
    permission: DataPermission.CREATE_QUERIES,
    type: DataPermissionType.NATIVE,
    isDisabled: !!disabledTooltip,
    disabledTooltip,
    isHighlighted: isAdmin,
    value,
    options: _.compact([
      dbValue === DataPermissionValue.QUERY_BUILDER_AND_NATIVE &&
        DATA_PERMISSION_OPTIONS.queryBuilderAndNative,
      DATA_PERMISSION_OPTIONS.queryBuilder,
      DATA_PERMISSION_OPTIONS.controlled,
      DATA_PERMISSION_OPTIONS.no,
    ]),
    postActions: {
      controlled: () => navigateToGranularPermissions(groupId, entityId),
    },
    confirmations: (newValue: DataPermissionValue) => [
      getWillRevokeNativeAccessWarningModal(permissions, groupId, entityId),
      getViewDataPermissionsTooRestrictiveWarningModal(
        permissions,
        groupId,
        entityId,
        database,
        newValue,
      ),
    ],
  };
};

export const buildTablesPermissions = ({
  entityId,
  groupId,
  groupType,
  permissions,
  originalPermissions,
  defaultGroup,
  database,
  showTransformPermissions,
}: {
  entityId: SchemaEntityId;
  groupId: number;
  groupType: SpecialGroupType;
  permissions: GroupsPermissions;
  originalPermissions: GroupsPermissions;
  defaultGroup: GroupInfo;
  database: PermissionsDatabase;
  showTransformPermissions: boolean;
}): PermissionSectionConfig[] => {
  const isAdmin = groupType === "admin";

  const accessPermission = buildTablesAccessPermission(
    entityId,
    groupId,
    isAdmin,
    permissions,
    originalPermissions,
    defaultGroup,
  );

  const nativePermission = buildTablesNativePermission(
    entityId,
    groupId,
    isAdmin,
    permissions,
    accessPermission.value,
    database,
  );

  const hasAnyAccessOptions = accessPermission.options.length > 1;

  const shouldShowViewDataColumn =
    PLUGIN_ADVANCED_PERMISSIONS.shouldShowViewDataColumn && hasAnyAccessOptions;

  return _.compact([
    shouldShowViewDataColumn && accessPermission,
    nativePermission,
    ...PLUGIN_FEATURE_LEVEL_PERMISSIONS.getFeatureLevelDataPermissions({
      entityId,
      groupId,
      groupType,
      permissions,
      dataAccessPermissionValue: accessPermission.value,
      defaultGroup,
      permissionSubject: "tables",
      showTransformPermissions,
    }),
  ]);
};

const buildFieldsAccessPermission = (
  entityId: TableEntityId,
  groupId: number,
  isAdmin: boolean,
  permissions: GroupsPermissions,
  originalPermissions: GroupsPermissions,
  defaultGroup: GroupInfo,
  database: PermissionsDatabase,
): PermissionSectionConfig => {
  const value = getFieldsPermission(
    permissions,
    groupId,
    entityId,
    DataPermission.VIEW_DATA,
  );

  const originalValue = getFieldsPermission(
    originalPermissions,
    groupId,
    entityId,
    DataPermission.VIEW_DATA,
  );

  const defaultGroupValue = getFieldsPermission(
    permissions,
    defaultGroup.id,
    entityId,
    DataPermission.VIEW_DATA,
  );

  const dbValue = getSchemasPermission(
    permissions,
    groupId,
    entityId,
    DataPermission.VIEW_DATA,
  );

  const schemaValue = getTablesPermission(
    permissions,
    groupId,
    entityId,
    DataPermission.VIEW_DATA,
  );

  const permissionWarning = getPermissionWarning(
    value,
    defaultGroupValue,
    "fields",
    defaultGroup,
    groupId,
  );

  const blockWarning = getBlockWarning(dbValue, schemaValue, value);

  // permissionWarning should always trump a blockWarning
  const warning = permissionWarning || blockWarning;

  const confirmations = (newValue: DataPermissionValue) => [
    getPermissionWarningModal(
      newValue,
      defaultGroupValue,
      "fields",
      defaultGroup,
      groupId,
      undefined,
    ),
    ...PLUGIN_ADMIN_PERMISSIONS_TABLE_FIELDS_CONFIRMATIONS.map((confirmation) =>
      confirmation(permissions, groupId, entityId, newValue),
    ),
    getRevokingAccessToAllTablesWarningModal(
      database,
      permissions,
      groupId,
      entityId,
      newValue,
    ),
  ];

  const options = PLUGIN_ADVANCED_PERMISSIONS.addTablePermissionOptions(
    _.compact([
      DATA_PERMISSION_OPTIONS.unrestricted,
      ...PLUGIN_ADMIN_PERMISSIONS_TABLE_FIELDS_OPTIONS,
      originalValue === DATA_PERMISSION_OPTIONS.noSelfServiceDeprecated.value &&
        DATA_PERMISSION_OPTIONS.noSelfServiceDeprecated,
    ]),
    value,
  );
  const isDisabled =
    isAdmin ||
    options.length <= 1 ||
    PLUGIN_ADVANCED_PERMISSIONS.isAccessPermissionDisabled(value, "fields");

  return {
    permission: DataPermission.VIEW_DATA,
    type: DataPermissionType.ACCESS,
    isDisabled,
    disabledTooltip: isAdmin
      ? Messages.UNABLE_TO_CHANGE_ADMIN_PERMISSIONS
      : null,
    isHighlighted: isAdmin,
    value,
    warning,
    options,
    actions: PLUGIN_ADMIN_PERMISSIONS_TABLE_FIELDS_ACTIONS,
    postActions: PLUGIN_ADMIN_PERMISSIONS_TABLE_FIELDS_POST_ACTION,
    confirmations,
  };
};

const buildFieldsNativePermission = (
  entityId: TableEntityId,
  groupId: number,
  isAdmin: boolean,
  permissions: GroupsPermissions,
  accessPermissionValue: DataPermissionValue,
): PermissionSectionConfig => {
  const schemaValue = getTablesPermission(
    permissions,
    groupId,
    entityId,
    DataPermission.CREATE_QUERIES,
  );

  const value = getFieldsPermission(
    permissions,
    groupId,
    entityId,
    DataPermission.CREATE_QUERIES,
  );

  const disabledTooltip = getNativePermissionDisabledTooltip(
    isAdmin,
    accessPermissionValue,
  );

  return {
    permission: DataPermission.CREATE_QUERIES,
    type: DataPermissionType.NATIVE,
    isDisabled: !!disabledTooltip,
    disabledTooltip,
    isHighlighted: isAdmin,
    value,
    options: _.compact([
      schemaValue === DataPermissionValue.QUERY_BUILDER_AND_NATIVE &&
        DATA_PERMISSION_OPTIONS.queryBuilderAndNative,
      DATA_PERMISSION_OPTIONS.queryBuilder,
      DATA_PERMISSION_OPTIONS.no,
    ]),
    confirmations: () => [
      getWillRevokeNativeAccessWarningModal(permissions, groupId, entityId),
    ],
  };
};

export const buildFieldsPermissions = ({
  entityId,
  groupId,
  groupType,
  permissions,
  originalPermissions,
  defaultGroup,
  database,
  showTransformPermissions,
}: {
  entityId: TableEntityId;
  groupId: number;
  groupType: SpecialGroupType;
  permissions: GroupsPermissions;
  originalPermissions: GroupsPermissions;
  defaultGroup: GroupInfo;
  database: PermissionsDatabase;
  showTransformPermissions: boolean;
}): PermissionSectionConfig[] => {
  const isAdmin = groupType === "admin";

  const accessPermission = buildFieldsAccessPermission(
    entityId,
    groupId,
    isAdmin,
    permissions,
    originalPermissions,
    defaultGroup,
    database,
  );

  const nativePermission = buildFieldsNativePermission(
    entityId,
    groupId,
    isAdmin,
    permissions,
    accessPermission.value,
  );

  const hasAnyAccessOptions = accessPermission.options.length > 1;
  const shouldShowViewDataColumn =
    PLUGIN_ADVANCED_PERMISSIONS.shouldShowViewDataColumn && hasAnyAccessOptions;

  return _.compact([
    shouldShowViewDataColumn && accessPermission,
    nativePermission,
    ...PLUGIN_FEATURE_LEVEL_PERMISSIONS.getFeatureLevelDataPermissions({
      entityId,
      groupId,
      groupType,
      permissions,
      dataAccessPermissionValue: accessPermission.value,
      defaultGroup,
      permissionSubject: "fields",
      showTransformPermissions,
    }),
  ]);
};
