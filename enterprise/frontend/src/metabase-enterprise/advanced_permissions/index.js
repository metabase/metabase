import { t } from "ttag";
import { push } from "react-router-redux";

import { hasPremiumFeature } from "metabase-enterprise/settings";
import { ModalRoute } from "metabase/hoc/ModalRoute";
import {
  PLUGIN_REDUCERS,
  PLUGIN_ADVANCED_PERMISSIONS,
  PLUGIN_ADMIN_PERMISSIONS_DATABASE_ROUTES,
  PLUGIN_ADMIN_PERMISSIONS_DATABASE_POST_ACTIONS,
  PLUGIN_ADMIN_PERMISSIONS_DATABASE_GROUP_ROUTES,
  PLUGIN_DATA_PERMISSIONS,
  PLUGIN_ADMIN_PERMISSIONS_DATABASE_ACTIONS,
} from "metabase/plugins";
import {
  getDatabaseFocusPermissionsUrl,
  getGroupFocusPermissionsUrl,
} from "metabase/admin/permissions/utils/urls";
import { UNABLE_TO_CHANGE_ADMIN_PERMISSIONS } from "metabase/admin/permissions/constants/messages";
import { ImpersonationModal } from "./components/ImpersonationModal";
import { getImpersonatedPostAction, advancedPermissionsSlice } from "./reducer";
import { getImpersonations } from "./selectors";
import { updateNativePermission } from "./graph";

const IMPERSONATED_PERMISSION_OPTION = {
  label: t`Impersonated`,
  value: "impersonated",
  icon: "database",
  iconColor: "warning",
};

const BLOCK_PERMISSION_OPTION = {
  label: t`Block`,
  value: "block",
  icon: "close",
  iconColor: "danger",
};

if (hasPremiumFeature("advanced_permissions")) {
  const addSelectedAdvancedPermission = (options, value) => {
    switch (value) {
      case BLOCK_PERMISSION_OPTION.value:
        return [...options, BLOCK_PERMISSION_OPTION];
      case IMPERSONATED_PERMISSION_OPTION.value:
        return [...options, IMPERSONATED_PERMISSION_OPTION];
    }

    return options;
  };

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

  PLUGIN_ADVANCED_PERMISSIONS.isAccessPermissionDisabled = (value, subject) => {
    return (
      ["tables", "fields"].includes(subject) &&
      [
        BLOCK_PERMISSION_OPTION.value,
        IMPERSONATED_PERMISSION_OPTION.value,
      ].includes(value)
    );
  };

  PLUGIN_ADMIN_PERMISSIONS_DATABASE_POST_ACTIONS["impersonated"] =
    getImpersonatedPostAction;

  PLUGIN_REDUCERS.advancedPermissionsPlugin = advancedPermissionsSlice.reducer;

  PLUGIN_DATA_PERMISSIONS.permissionsPayloadExtraSelectors.push(state => ({
    impersonations: getImpersonations(state),
  }));

  PLUGIN_DATA_PERMISSIONS.hasChanges.push(
    state => getImpersonations(state).length > 0,
  );

  PLUGIN_ADMIN_PERMISSIONS_DATABASE_ACTIONS["impersonated"].push({
    label: t`Edit Impersonated`,
    iconColor: "warning",
    icon: "database",
    actionCreator: (entityId, groupId, view) =>
      push(getEditImpersonationUrl(entityId, groupId, view)),
  });

  PLUGIN_DATA_PERMISSIONS.updateNativePermission = updateNativePermission;
  PLUGIN_DATA_PERMISSIONS.getNativePermissionDisabledTooltip = isAdmin =>
    isAdmin ? UNABLE_TO_CHANGE_ADMIN_PERMISSIONS : null;
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
