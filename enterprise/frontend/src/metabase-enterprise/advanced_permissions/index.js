import React from "react";
import { t } from "ttag";

import { hasPremiumFeature } from "metabase-enterprise/settings";
import { ModalRoute } from "metabase/hoc/ModalRoute";
import {
  PLUGIN_REDUCERS,
  PLUGIN_ADVANCED_PERMISSIONS,
  PLUGIN_ADMIN_PERMISSIONS_DATABASE_ROUTES,
  PLUGIN_ADMIN_PERMISSIONS_DATABASE_POST_ACTION,
  PLUGIN_ADMIN_PERMISSIONS_DATABASE_GROUP_ROUTES,
  PLUGIN_DATA_PERMISSIONS,
} from "metabase/plugins";
import { ImpersonationModal } from "./components/ImpersonationModal";
import { getImpersonatedPostAction, advancedPermissionsSlice } from "./reducer";
import { getImpersonations } from "./selectors";

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
  const addBlockPermissionWhenSelected = (options, value) =>
    value === BLOCK_PERMISSION_OPTION.value
      ? [...options, BLOCK_PERMISSION_OPTION]
      : options;

  PLUGIN_ADVANCED_PERMISSIONS.addTablePermissionOptions =
    addBlockPermissionWhenSelected;
  PLUGIN_ADVANCED_PERMISSIONS.addSchemaPermissionOptions =
    addBlockPermissionWhenSelected;
  PLUGIN_ADVANCED_PERMISSIONS.addDatabasePermissionOptions = options => [
    ...options,
    IMPERSONATED_PERMISSION_OPTION,
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

  PLUGIN_ADMIN_PERMISSIONS_DATABASE_POST_ACTION["impersonated"] =
    getImpersonatedPostAction;

  PLUGIN_REDUCERS.advancedPermissionsPlugin = advancedPermissionsSlice.reducer;

  PLUGIN_DATA_PERMISSIONS.getPermissionsPayloadExtraData = state => {
    return {
      impersonations: getImpersonations(state),
    };
  };
}
