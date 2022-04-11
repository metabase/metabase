import _ from "underscore";
import { push } from "react-router-redux";

import { DATA_PERMISSION_OPTIONS } from "../../constants/data-permissions";
import {
  getNativePermission,
  getTablesPermission,
} from "metabase/admin/permissions/utils/graph";
import {
  NATIVE_PERMISSION_REQUIRES_DATA_ACCESS,
  UNABLE_TO_CHANGE_ADMIN_PERMISSIONS,
} from "../../constants/messages";
import {
  PLUGIN_ADVANCED_PERMISSIONS,
  PLUGIN_FEATURE_LEVEL_PERMISSIONS,
} from "metabase/plugins";
import {
  getPermissionWarning,
  getPermissionWarningModal,
  getControlledDatabaseWarningModal,
} from "../confirmations";
import { Group, GroupsPermissions } from "metabase-types/api";
import { SchemaEntityId } from "../../types";

const buildAccessPermission = (
  entityId: SchemaEntityId,
  groupId: number,
  isAdmin: boolean,
  permissions: GroupsPermissions,
  defaultGroup: Group,
) => {
  const value = getTablesPermission(permissions, groupId, entityId, "data");
  const defaultGroupValue = getTablesPermission(
    permissions,
    defaultGroup.id,
    entityId,
    "data",
  );

  const warning = getPermissionWarning(
    value,
    defaultGroupValue,
    "tables",
    defaultGroup,
    groupId,
  );

  const confirmations = (newValue: string) => [
    getPermissionWarningModal(
      newValue,
      defaultGroupValue,
      "tables",
      defaultGroup,
      groupId,
    ),
    getControlledDatabaseWarningModal(permissions, groupId, entityId),
  ];

  return {
    permission: "data",
    type: "access",
    isDisabled: isAdmin || PLUGIN_ADVANCED_PERMISSIONS.isBlockPermission(value),
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
    options: PLUGIN_ADVANCED_PERMISSIONS.addSchemaPermissionOptions(
      [
        DATA_PERMISSION_OPTIONS.all,
        DATA_PERMISSION_OPTIONS.controlled,
        DATA_PERMISSION_OPTIONS.noSelfService,
      ],
      value,
    ),
  };
};

const buildNativePermission = (
  entityId: SchemaEntityId,
  groupId: number,
  isAdmin: boolean,
  permissions: GroupsPermissions,
) => {
  return {
    permission: "data",
    type: "native",
    isDisabled: true,
    disabledTooltip: isAdmin
      ? UNABLE_TO_CHANGE_ADMIN_PERMISSIONS
      : NATIVE_PERMISSION_REQUIRES_DATA_ACCESS,
    isHighlighted: isAdmin,
    value: getNativePermission(permissions, groupId, entityId),
    options: [DATA_PERMISSION_OPTIONS.write, DATA_PERMISSION_OPTIONS.none],
  };
};

export const buildTablesPermissions = (
  entityId: SchemaEntityId,
  groupId: number,
  isAdmin: boolean,
  permissions: GroupsPermissions,
  defaultGroup: Group,
) => {
  const accessPermission = buildAccessPermission(
    entityId,
    groupId,
    isAdmin,
    permissions,
    defaultGroup,
  );

  const nativePermission = buildNativePermission(
    entityId,
    groupId,
    isAdmin,
    permissions,
  );

  return [
    accessPermission,
    nativePermission,
    ...PLUGIN_FEATURE_LEVEL_PERMISSIONS.getFeatureLevelDataPermissions(
      entityId,
      groupId,
      isAdmin,
      permissions,
      accessPermission.value,
      "tables",
    ),
  ];
};
