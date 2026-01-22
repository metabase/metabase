import _ from "underscore";

import { getNativePermissionDisabledTooltip } from "metabase/admin/permissions/selectors/data-permissions/shared";
import {
  getFieldsPermission,
  getSchemasPermission,
  getTablesPermission,
} from "metabase/admin/permissions/utils/graph";
import {
  PLUGIN_ADMIN_PERMISSIONS_TABLE_FIELDS_ACTIONS,
  PLUGIN_ADMIN_PERMISSIONS_TABLE_FIELDS_CONFIRMATIONS,
  PLUGIN_ADMIN_PERMISSIONS_TABLE_FIELDS_OPTIONS,
  PLUGIN_ADMIN_PERMISSIONS_TABLE_FIELDS_POST_ACTION,
  PLUGIN_ADVANCED_PERMISSIONS,
  PLUGIN_FEATURE_LEVEL_PERMISSIONS,
} from "metabase/plugins";
import type Database from "metabase-lib/v1/metadata/Database";
import type { Group, GroupsPermissions } from "metabase-types/api";

import { DATA_PERMISSION_OPTIONS } from "../../constants/data-permissions";
import { Messages } from "../../constants/messages";
import type {
  PermissionSectionConfig,
  SpecialGroupType,
  TableEntityId,
} from "../../types";
import {
  DataPermission,
  DataPermissionType,
  DataPermissionValue,
} from "../../types";
import {
  getBlockWarning,
  getPermissionWarning,
  getPermissionWarningModal,
  getRevokingAccessToAllTablesWarningModal,
  getWillRevokeNativeAccessWarningModal,
} from "../confirmations";

const buildAccessPermission = (
  entityId: TableEntityId,
  groupId: number,
  isAdmin: boolean,
  permissions: GroupsPermissions,
  originalPermissions: GroupsPermissions,
  defaultGroup: Group,
  database: Database,
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

const buildNativePermission = (
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

export const buildFieldsPermissions = (
  entityId: TableEntityId,
  groupId: number,
  groupType: SpecialGroupType,
  permissions: GroupsPermissions,
  originalPermissions: GroupsPermissions,
  defaultGroup: Group,
  database: Database,
): PermissionSectionConfig[] => {
  const isAdmin = groupType === "admin";

  const accessPermission = buildAccessPermission(
    entityId,
    groupId,
    isAdmin,
    permissions,
    originalPermissions,
    defaultGroup,
    database,
  );

  const nativePermission = buildNativePermission(
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
    ...PLUGIN_FEATURE_LEVEL_PERMISSIONS.getFeatureLevelDataPermissions(
      entityId,
      groupId,
      groupType,
      permissions,
      accessPermission.value,
      defaultGroup,
      "fields",
    ),
  ]);
};
