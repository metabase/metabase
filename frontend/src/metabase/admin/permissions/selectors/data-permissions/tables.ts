import _ from "underscore";
import { push } from "react-router-redux";

import { DATA_PERMISSION_OPTIONS } from "../../constants/data-permissions";
import {
  getNativePermission,
  getTablesPermission,
  SchemaEntityId,
  TableEntityId,
} from "metabase/lib/permissions";
import {
  DATA_ACCESS_IS_REQUIRED,
  UNABLE_TO_CHANGE_ADMIN_PERMISSIONS,
} from "../../constants/messages";
import { PLUGIN_ADVANCED_PERMISSIONS } from "metabase/plugins";
import {
  getPermissionWarning,
  getPermissionWarningModal,
  getControlledDatabaseWarningModal,
} from "../confirmations";
import { Group, GroupsPermissions } from "metabase-types/types/Permissions";

export const buildTablesPermissions = (
  entityId: SchemaEntityId,
  groupId: number,
  isAdmin: boolean,
  permissions: GroupsPermissions,
  defaultGroup: Group,
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

  return [
    {
      name: "access",
      isDisabled:
        isAdmin || PLUGIN_ADVANCED_PERMISSIONS.isBlockPermission(value),
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
    },
    {
      name: "native",
      isDisabled: true,
      disabledTooltip: isAdmin
        ? UNABLE_TO_CHANGE_ADMIN_PERMISSIONS
        : DATA_ACCESS_IS_REQUIRED,
      isHighlighted: isAdmin,
      value: getNativePermission(permissions, groupId, entityId),
      options: [DATA_PERMISSION_OPTIONS.write, DATA_PERMISSION_OPTIONS.none],
    },
  ];
};
