import { push } from "react-router-redux";
import _ from "underscore";

import { getNativePermissionDisabledTooltip } from "metabase/admin/permissions/selectors/data-permissions/shared";
import {
  getNativePermission,
  getTablesPermission,
} from "metabase/admin/permissions/utils/graph";
import {
  PLUGIN_ADVANCED_PERMISSIONS,
  PLUGIN_FEATURE_LEVEL_PERMISSIONS,
} from "metabase/plugins";
import type { Group, GroupsPermissions } from "metabase-types/api";

import { DATA_PERMISSION_OPTIONS } from "../../constants/data-permissions";
import { UNABLE_TO_CHANGE_ADMIN_PERMISSIONS } from "../../constants/messages";
import type { PermissionSectionConfig, SchemaEntityId } from "../../types";
import { getGroupFocusPermissionsUrl } from "../../utils/urls";
import {
  getControlledDatabaseWarningModal,
  getPermissionWarning,
  getPermissionWarningModal,
} from "../confirmations";

const buildAccessPermission = (
  entityId: SchemaEntityId,
  groupId: number,
  isAdmin: boolean,
  permissions: GroupsPermissions,
  originalPermissions: GroupsPermissions,
  defaultGroup: Group,
) => {
  const value = getTablesPermission(
    permissions,
    groupId,
    entityId,
    "view-data",
  );

  const originalValue = getTablesPermission(
    originalPermissions,
    groupId,
    entityId,
    "view-data",
  );

  const defaultGroupValue = getTablesPermission(
    permissions,
    defaultGroup.id,
    entityId,
    "view-data",
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
    getControlledDatabaseWarningModal(newValue, entityId),
  ];

  return {
    permission: "view-data",
    type: "access",
    isDisabled:
      isAdmin ||
      PLUGIN_ADVANCED_PERMISSIONS.isAccessPermissionDisabled(value, "tables"),
    isHighlighted: isAdmin,
    disabledTooltip: isAdmin ? UNABLE_TO_CHANGE_ADMIN_PERMISSIONS : null,
    value,
    warning,
    confirmations,
    postActions: {
      controlled: () => push(getGroupFocusPermissionsUrl(groupId, entityId)),
    },
    options: PLUGIN_ADVANCED_PERMISSIONS.addSchemaPermissionOptions(
      _.compact([
        DATA_PERMISSION_OPTIONS.all,
        DATA_PERMISSION_OPTIONS.controlled,
        originalValue === DATA_PERMISSION_OPTIONS.noSelfService.value &&
          DATA_PERMISSION_OPTIONS.noSelfService,
      ]),
      value,
    ),
  };
};

const buildNativePermission = (
  entityId: SchemaEntityId,
  groupId: number,
  isAdmin: boolean,
  permissions: GroupsPermissions,
  accessPermissionValue: string,
) => {
  return {
    permission: "create-queries",
    type: "native",
    isDisabled: true,
    disabledTooltip: getNativePermissionDisabledTooltip(
      isAdmin,
      accessPermissionValue,
    ),
    isHighlighted: isAdmin,
    value: getNativePermission(permissions, groupId, entityId),
    options: [DATA_PERMISSION_OPTIONS.queryBuilder, DATA_PERMISSION_OPTIONS.no],
  };
};

export const buildTablesPermissions = (
  entityId: SchemaEntityId,
  groupId: number,
  isAdmin: boolean,
  permissions: GroupsPermissions,
  originalPermissions: GroupsPermissions,
  defaultGroup: Group,
): PermissionSectionConfig[] => {
  const accessPermission = buildAccessPermission(
    entityId,
    groupId,
    isAdmin,
    permissions,
    originalPermissions,
    defaultGroup,
  );

  const nativePermission = buildNativePermission(
    entityId,
    groupId,
    isAdmin,
    permissions,
    accessPermission.value,
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
      defaultGroup,
      "tables",
    ),
  ];
};
