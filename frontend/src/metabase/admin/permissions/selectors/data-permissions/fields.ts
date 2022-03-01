import _ from "underscore";

import { DATA_PERMISSION_OPTIONS } from "../../constants/data-permissions";
import {
  getFieldsPermission,
  getNativePermission,
  TableEntityId,
} from "metabase/lib/permissions";
import {
  DATA_ACCESS_IS_REQUIRED,
  UNABLE_TO_CHANGE_ADMIN_PERMISSIONS,
} from "../../constants/messages";
import {
  PLUGIN_ADMIN_PERMISSIONS_TABLE_FIELDS_ACTIONS,
  PLUGIN_ADMIN_PERMISSIONS_TABLE_FIELDS_OPTIONS,
  PLUGIN_ADMIN_PERMISSIONS_TABLE_FIELDS_POST_ACTION,
  PLUGIN_ADVANCED_PERMISSIONS,
} from "metabase/plugins";
import {
  getPermissionWarning,
  getPermissionWarningModal,
  getControlledDatabaseWarningModal,
  getRevokingAccessToAllTablesWarningModal,
} from "../confirmations";
import { Group, GroupsPermissions } from "metabase-types/types/Permissions";
import Database from "metabase-lib/lib/metadata/Database";

export const buildFieldsPermissions = (
  entityId: TableEntityId,
  groupId: number,
  isAdmin: boolean,
  permissions: GroupsPermissions,
  defaultGroup: Group,
  database: Database | null,
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

  const confirmations = (newValue: string) => [
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
      isDisabled:
        isAdmin || PLUGIN_ADVANCED_PERMISSIONS.isBlockPermission(value),
      disabledTooltip: isAdmin ? UNABLE_TO_CHANGE_ADMIN_PERMISSIONS : null,
      isHighlighted: isAdmin,
      value,
      warning,
      options: PLUGIN_ADVANCED_PERMISSIONS.addTablePermissionOptions(
        [
          DATA_PERMISSION_OPTIONS.all,
          ...PLUGIN_ADMIN_PERMISSIONS_TABLE_FIELDS_OPTIONS,
          DATA_PERMISSION_OPTIONS.noSelfService,
        ],
        value,
      ),
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
      options: [DATA_PERMISSION_OPTIONS.write, DATA_PERMISSION_OPTIONS.none],
    },
  ];
};
