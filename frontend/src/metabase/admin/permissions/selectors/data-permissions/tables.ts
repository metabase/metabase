import _ from "underscore";

import { getNativePermissionDisabledTooltip } from "metabase/admin/permissions/selectors/data-permissions/shared";
import {
  getSchemasPermission,
  getTablesPermission,
} from "metabase/admin/permissions/utils/graph";
import {
  PLUGIN_ADMIN_PERMISSIONS_TABLE_CONFIRMATIONS,
  PLUGIN_ADMIN_PERMISSIONS_TABLE_CREATE_QUERIES_OPTIONS,
  PLUGIN_ADMIN_PERMISSIONS_TABLE_VIEW_DATA_OPTIONS,
  PLUGIN_ADVANCED_PERMISSIONS,
  PLUGIN_FEATURE_LEVEL_PERMISSIONS,
} from "metabase/plugins";
import type Database from "metabase-lib/v1/metadata/Database";
import type { Group, GroupsPermissions } from "metabase-types/api";

import { DATA_PERMISSION_OPTIONS } from "../../constants/data-permissions";
import { UNABLE_TO_CHANGE_ADMIN_PERMISSIONS } from "../../constants/messages";
import { navigateToGranularPermissions } from "../../permissions";
import type { PermissionSectionConfig, SchemaEntityId } from "../../types";
import {
  DataPermission,
  DataPermissionType,
  DataPermissionValue,
} from "../../types";
import {
  getPermissionWarning,
  getPermissionWarningModal,
  getViewDataPermissionsTooRestrictiveWarningModal,
} from "../confirmations";

const buildAccessPermission = (
  entityId: SchemaEntityId,
  groupId: number,
  isAdmin: boolean,
  permissions: GroupsPermissions,
  originalPermissions: GroupsPermissions,
  defaultGroup: Group,
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

  const warning = getPermissionWarning(
    value,
    defaultGroupValue,
    "tables",
    defaultGroup,
    groupId,
  );

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
      ...PLUGIN_ADMIN_PERMISSIONS_TABLE_VIEW_DATA_OPTIONS,
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
    disabledTooltip: isAdmin ? UNABLE_TO_CHANGE_ADMIN_PERMISSIONS : null,
    value,
    warning,
    confirmations,
    postActions: {
      controlled: () => navigateToGranularPermissions(groupId, entityId),
    },
    options,
  };
};

const buildNativePermission = (
  entityId: SchemaEntityId,
  groupId: number,
  isAdmin: boolean,
  permissions: GroupsPermissions,
  accessPermissionValue: DataPermissionValue,
  database: Database,
): PermissionSectionConfig => {
  const value = getTablesPermission(
    permissions,
    groupId,
    entityId,
    DataPermission.CREATE_QUERIES,
  );

  const dbValue = getSchemasPermission(
    permissions,
    groupId,
    { databaseId: entityId.databaseId },
    DataPermission.CREATE_QUERIES,
  );

  const options = _.uniq(
    _.compact([
      dbValue === DataPermissionValue.QUERY_BUILDER_AND_NATIVE &&
        DATA_PERMISSION_OPTIONS.queryBuilderAndNative,
      ...PLUGIN_ADMIN_PERMISSIONS_TABLE_CREATE_QUERIES_OPTIONS,
      DATA_PERMISSION_OPTIONS.queryBuilder,
      DATA_PERMISSION_OPTIONS.controlled,
      DATA_PERMISSION_OPTIONS.no,
    ]),
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
    options,
    postActions: {
      controlled: () => navigateToGranularPermissions(groupId, entityId),
    },
    confirmations: (newValue: DataPermissionValue) => [
      ...PLUGIN_ADMIN_PERMISSIONS_TABLE_CONFIRMATIONS.map(confirmation =>
        confirmation(permissions, groupId, entityId, newValue),
      ),
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

export const buildTablesPermissions = (
  entityId: SchemaEntityId,
  groupId: number,
  isAdmin: boolean,
  permissions: GroupsPermissions,
  originalPermissions: GroupsPermissions,
  defaultGroup: Group,
  database: Database,
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
    database,
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
      isAdmin,
      permissions,
      accessPermission.value,
      defaultGroup,
      "tables",
    ),
  ]);
};
