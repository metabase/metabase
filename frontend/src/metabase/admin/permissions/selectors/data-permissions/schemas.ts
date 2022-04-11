import _ from "underscore";

import { DATA_PERMISSION_OPTIONS } from "../../constants/data-permissions";
import {
  getNativePermission,
  getSchemasPermission,
  isRestrictivePermission,
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
  getRawQueryWarningModal,
} from "../confirmations";
import { limitDatabasePermission } from "../../permissions";
import { Group, GroupsPermissions } from "metabase-types/api";
import { DatabaseEntityId } from "../../types";

const buildAccessPermission = (
  entityId: DatabaseEntityId,
  groupId: number,
  isAdmin: boolean,
  permissions: GroupsPermissions,
  defaultGroup: Group,
) => {
  const accessPermissionConfirmations = (newValue: string) => [
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
    "data",
  );
  const defaultGroupAccessPermissionValue = getSchemasPermission(
    permissions,
    defaultGroup.id,
    entityId,
    "data",
  );
  const accessPermissionWarning = getPermissionWarning(
    accessPermissionValue,
    defaultGroupAccessPermissionValue,
    "schemas",
    defaultGroup,
    groupId,
  );

  return {
    permission: "data",
    type: "access",
    isDisabled: isAdmin,
    disabledTooltip: isAdmin ? UNABLE_TO_CHANGE_ADMIN_PERMISSIONS : null,
    isHighlighted: isAdmin,
    value: accessPermissionValue,
    warning: accessPermissionWarning,
    confirmations: accessPermissionConfirmations,
    options: PLUGIN_ADVANCED_PERMISSIONS.addDatabasePermissionOptions([
      DATA_PERMISSION_OPTIONS.all,
      DATA_PERMISSION_OPTIONS.controlled,
      DATA_PERMISSION_OPTIONS.noSelfService,
    ]),
    postActions: {
      controlled: () =>
        limitDatabasePermission(
          groupId,
          entityId,
          PLUGIN_ADVANCED_PERMISSIONS.isBlockPermission(accessPermissionValue)
            ? DATA_PERMISSION_OPTIONS.noSelfService.value
            : null,
        ),
    },
  };
};

const buildNativePermission = (
  entityId: DatabaseEntityId,
  groupId: number,
  isAdmin: boolean,
  permissions: GroupsPermissions,
  defaultGroup: Group,
  accessPermissionValue: string,
) => {
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

  const nativePermissionConfirmations = (newValue: string) => [
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

  return {
    permission: "data",
    type: "native",
    isDisabled: isNativePermissionDisabled,
    disabledTooltip: isAdmin
      ? UNABLE_TO_CHANGE_ADMIN_PERMISSIONS
      : NATIVE_PERMISSION_REQUIRES_DATA_ACCESS,
    isHighlighted: isAdmin,
    value: nativePermissionValue,
    warning: nativePermissionWarning,
    confirmations: nativePermissionConfirmations,
    options: [DATA_PERMISSION_OPTIONS.write, DATA_PERMISSION_OPTIONS.none],
  };
};

export const buildSchemasPermissions = (
  entityId: DatabaseEntityId,
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
    defaultGroup,
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
      "schemas",
    ),
  ];
};
