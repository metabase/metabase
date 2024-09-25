import { push } from "react-router-redux";
import { t } from "ttag";

import { DATA_PERMISSION_OPTIONS } from "metabase/admin/permissions/constants/data-permissions";
import { getWillRevokeNativeAccessWarningModal } from "metabase/admin/permissions/selectors/confirmations";
import { DataPermissionValue } from "metabase/admin/permissions/types";
import {
  getDatabaseFocusPermissionsUrl,
  getGroupFocusPermissionsUrl,
} from "metabase/admin/permissions/utils/urls";
import { ModalRoute } from "metabase/hoc/ModalRoute";
import {
  PLUGIN_ADMIN_PERMISSIONS_DATABASE_ACTIONS,
  PLUGIN_ADMIN_PERMISSIONS_DATABASE_GROUP_ROUTES,
  PLUGIN_ADMIN_PERMISSIONS_DATABASE_POST_ACTIONS,
  PLUGIN_ADMIN_PERMISSIONS_DATABASE_ROUTES,
  PLUGIN_ADMIN_PERMISSIONS_TABLE_CONFIRMATIONS,
  PLUGIN_ADMIN_PERMISSIONS_TABLE_CREATE_QUERIES_OPTIONS,
  PLUGIN_ADMIN_PERMISSIONS_TABLE_FIELDS_CONFIRMATIONS,
  PLUGIN_ADMIN_PERMISSIONS_TABLE_FIELDS_CREATE_QUERIES_OPTIONS,
  PLUGIN_ADMIN_PERMISSIONS_TABLE_FIELDS_VIEW_DATA_OPTIONS,
  PLUGIN_ADMIN_PERMISSIONS_TABLE_VIEW_DATA_OPTIONS,
  PLUGIN_ADVANCED_PERMISSIONS,
  PLUGIN_DATA_PERMISSIONS,
  PLUGIN_REDUCERS,
} from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { ImpersonationModal } from "./components/ImpersonationModal";
import {
  restrictNativePermissions,
  shouldRestrictNativeQueryPermissions,
  upgradeViewPermissionsIfNeeded,
} from "./graph";
import { advancedPermissionsSlice, getImpersonatedPostAction } from "./reducer";
import { getImpersonations } from "./selectors";

const IMPERSONATED_PERMISSION_OPTION = {
  label: t`Impersonated`,
  value: DataPermissionValue.IMPERSONATED,
  icon: "database",
  iconColor: "warning",
};

const BLOCK_PERMISSION_OPTION = {
  label: t`Blocked`,
  value: DataPermissionValue.BLOCKED,
  icon: "close",
  iconColor: "danger",
};

function removeGetWillRevokeNativeAccessWarningModalConfirmation(
  confirmations,
) {
  const index = confirmations.findIndex(
    confirmation => confirmation === getWillRevokeNativeAccessWarningModal,
  );

  if (index !== -1) {
    confirmations.splice(index, 1);
  }
}

if (hasPremiumFeature("advanced_permissions")) {
  const addSelectedAdvancedPermission = (options, value) => {
    if (value === IMPERSONATED_PERMISSION_OPTION.value) {
      return [...options, IMPERSONATED_PERMISSION_OPTION];
    }

    return options;
  };

  PLUGIN_ADMIN_PERMISSIONS_TABLE_VIEW_DATA_OPTIONS.push(
    BLOCK_PERMISSION_OPTION,
  );
  PLUGIN_ADMIN_PERMISSIONS_TABLE_CREATE_QUERIES_OPTIONS.push(
    DATA_PERMISSION_OPTIONS.queryBuilderAndNative,
  );

  PLUGIN_ADMIN_PERMISSIONS_TABLE_FIELDS_VIEW_DATA_OPTIONS.push(
    BLOCK_PERMISSION_OPTION,
  );
  PLUGIN_ADMIN_PERMISSIONS_TABLE_FIELDS_CREATE_QUERIES_OPTIONS.push(
    DATA_PERMISSION_OPTIONS.queryBuilderAndNative,
  );

  // remove warning about blanket removal of native query permissions as we don't have to do this
  // in EE as we can do table level blocking
  removeGetWillRevokeNativeAccessWarningModalConfirmation(
    PLUGIN_ADMIN_PERMISSIONS_TABLE_FIELDS_CONFIRMATIONS,
  );
  removeGetWillRevokeNativeAccessWarningModalConfirmation(
    PLUGIN_ADMIN_PERMISSIONS_TABLE_CONFIRMATIONS,
  );

  PLUGIN_ADVANCED_PERMISSIONS.addTablePermissionOptions =
    addSelectedAdvancedPermission;
  PLUGIN_ADVANCED_PERMISSIONS.addSchemaPermissionOptions =
    addSelectedAdvancedPermission;
  PLUGIN_ADVANCED_PERMISSIONS.addDatabasePermissionOptions = (
    options,
    database,
  ) => [
    ...options,
    ...(database.hasFeature("connection-impersonation")
      ? [IMPERSONATED_PERMISSION_OPTION]
      : []),
    BLOCK_PERMISSION_OPTION,
  ];

  PLUGIN_ADMIN_PERMISSIONS_DATABASE_ROUTES.push(
    <ModalRoute
      key="impersonated/group/:groupId"
      path="impersonated/group/:groupId"
      modal={ImpersonationModal}
    />,
  );

  PLUGIN_ADMIN_PERMISSIONS_DATABASE_GROUP_ROUTES.push(
    <ModalRoute
      key="impersonated/database/:impersonatedDatabaseId"
      path="impersonated/database/:impersonatedDatabaseId"
      modal={ImpersonationModal}
    />,
  );

  PLUGIN_ADVANCED_PERMISSIONS.isBlockPermission = value =>
    value === BLOCK_PERMISSION_OPTION.value;

  PLUGIN_ADVANCED_PERMISSIONS.getDatabaseLimitedAccessPermission = value => {
    if (value === IMPERSONATED_PERMISSION_OPTION.value) {
      return DataPermissionValue.UNRESTRICTED;
    }

    return null;
  };
  PLUGIN_ADVANCED_PERMISSIONS.isAccessPermissionDisabled = (value, subject) => {
    if (subject === "tables" || subject === "fields") {
      return value === DataPermissionValue.IMPERSONATED;
    } else {
      return false;
    }
  };

  PLUGIN_ADVANCED_PERMISSIONS.isRestrictivePermission = value => {
    return value === DataPermissionValue.BLOCKED;
  };

  PLUGIN_ADVANCED_PERMISSIONS.shouldShowViewDataColumn = true;

  PLUGIN_ADVANCED_PERMISSIONS.defaultViewDataPermission =
    DataPermissionValue.BLOCKED;

  PLUGIN_ADMIN_PERMISSIONS_DATABASE_POST_ACTIONS[
    DataPermissionValue.IMPERSONATED
  ] = getImpersonatedPostAction;

  PLUGIN_REDUCERS.advancedPermissionsPlugin = advancedPermissionsSlice.reducer;

  PLUGIN_DATA_PERMISSIONS.permissionsPayloadExtraSelectors.push(
    (state, data) => {
      const impersonations = getImpersonations(state);
      const impersonationGroupIds = impersonations.map(i => `${i.group_id}`);
      return [{ impersonations }, impersonationGroupIds];
    },
  );

  PLUGIN_DATA_PERMISSIONS.hasChanges.push(
    state => getImpersonations(state).length > 0,
  );

  PLUGIN_ADMIN_PERMISSIONS_DATABASE_ACTIONS[
    DataPermissionValue.IMPERSONATED
  ].push({
    label: t`Edit Impersonated`,
    iconColor: "warning",
    icon: "database",
    actionCreator: (entityId, groupId, view) =>
      push(getEditImpersonationUrl(entityId, groupId, view)),
  });

  PLUGIN_DATA_PERMISSIONS.upgradeViewPermissionsIfNeeded =
    upgradeViewPermissionsIfNeeded;

  PLUGIN_DATA_PERMISSIONS.shouldRestrictNativeQueryPermissions =
    shouldRestrictNativeQueryPermissions;

  PLUGIN_DATA_PERMISSIONS.restrictNativePermissions = restrictNativePermissions;
}

const getDatabaseViewImpersonationModalUrl = (entityId, groupId) => {
  const baseUrl = getDatabaseFocusPermissionsUrl(entityId);
  return `${baseUrl}/impersonated/group/${groupId}`;
};

const getGroupViewImpersonationModalUrl = (entityId, groupId) => {
  const baseUrl = getGroupFocusPermissionsUrl(groupId);

  return `${baseUrl}/impersonated/database/${entityId.databaseId}`;
};

const getEditImpersonationUrl = (entityId, groupId, view) =>
  view === "database"
    ? getDatabaseViewImpersonationModalUrl(entityId, groupId)
    : getGroupViewImpersonationModalUrl(entityId, groupId);
