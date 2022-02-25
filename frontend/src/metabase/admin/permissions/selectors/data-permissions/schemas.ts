import _ from "underscore";

import { DATA_PERMISSION_OPTIONS } from "../../constants/data-permissions";
import {
  DatabaseEntityId,
  getNativePermission,
  getSchemasDataPermission,
  isRestrictivePermission,
} from "metabase/lib/permissions";
import {
  DATA_ACCESS_IS_REQUIRED,
  UNABLE_TO_CHANGE_ADMIN_PERMISSIONS,
} from "../../constants/messages";
import { PLUGIN_ADVANCED_PERMISSIONS } from "metabase/plugins";
import {
  getPermissionWarning,
  getPermissionWarningModal,
  getRawQueryWarningModal,
} from "../confirmations";
import { limitDatabasePermission } from "../../permissions";
import { Group, GroupsPermissions } from "metabase-types/types/Permissions";

export const buildSchemasPermissions = (
  entityId: DatabaseEntityId,
  groupId: number,
  isAdmin: boolean,
  permissions: GroupsPermissions,
  defaultGroup: Group,
) => {
  const accessPermissionValue = getSchemasDataPermission(
    permissions,
    groupId,
    entityId,
  );
  const defaultGroupAccessPermissionValue = getSchemasDataPermission(
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

  const accessPermissionConfirmations = (newValue: string) => [
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

  return [
    {
      name: "access",
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
      options: [DATA_PERMISSION_OPTIONS.write, DATA_PERMISSION_OPTIONS.none],
    },
  ];
};
