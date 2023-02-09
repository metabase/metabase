import React from "react";
import { push } from "react-router-redux";
import { t } from "ttag";
import {
  PLUGIN_REDUCERS,
  PLUGIN_DATA_PERMISSIONS,
  PLUGIN_ADMIN_USER_FORM_FIELDS,
  PLUGIN_ADMIN_PERMISSIONS_TABLE_ROUTES,
  PLUGIN_ADMIN_PERMISSIONS_TABLE_GROUP_ROUTES,
  PLUGIN_ADMIN_PERMISSIONS_TABLE_FIELDS_OPTIONS,
  PLUGIN_ADMIN_PERMISSIONS_TABLE_FIELDS_ACTIONS,
  PLUGIN_ADMIN_PERMISSIONS_TABLE_FIELDS_POST_ACTION,
  PLUGIN_ADMIN_PERMISSIONS_TABLE_FIELDS_PERMISSION_VALUE,
} from "metabase/plugins";

import { hasPremiumFeature } from "metabase-enterprise/settings";
import {
  getDatabaseFocusPermissionsUrl,
  getGroupFocusPermissionsUrl,
} from "metabase/admin/permissions/utils/urls";
import { ModalRoute } from "metabase/hoc/ModalRoute";

import LoginAttributesWidget from "./components/LoginAttributesWidget";
import EditSandboxingModal from "./containers/EditSandboxingModal";
import sandboxingReducer from "./actions";
import { getDraftPolicies, hasPolicyChanges } from "./selectors";

const OPTION_SEGMENTED = {
  label: t`Sandboxed`,
  value: "controlled",
  icon: "permissions_limited",
  iconColor: "brand",
};

const getDatabaseViewSandboxModalUrl = (entityId, groupId) => {
  const baseUrl = getDatabaseFocusPermissionsUrl(entityId, groupId);
  return `${baseUrl}/segmented/group/${groupId}`;
};

const getGroupViewSandboxModalUrl = (entityId, groupId) => {
  const baseUrl = getGroupFocusPermissionsUrl(groupId, {
    ...entityId,
    tableId: null,
  });
  return `${baseUrl}/${entityId.tableId}/segmented`;
};

const getEditSegementedAccessUrl = (entityId, groupId, view) =>
  view === "database"
    ? getDatabaseViewSandboxModalUrl(entityId, groupId)
    : getGroupViewSandboxModalUrl(entityId, groupId);

const getEditSegmentedAccessPostAction = (entityId, groupId, view) =>
  push(getEditSegementedAccessUrl(entityId, groupId, view));

if (hasPremiumFeature("sandboxes")) {
  PLUGIN_ADMIN_USER_FORM_FIELDS.push({
    name: "login_attributes",
    title: "Attributes",
    type: LoginAttributesWidget,
  });
  PLUGIN_ADMIN_PERMISSIONS_TABLE_ROUTES.push(
    <ModalRoute
      key=":tableId/segmented"
      path=":tableId/segmented"
      modal={EditSandboxingModal}
    />,
  );
  PLUGIN_ADMIN_PERMISSIONS_TABLE_GROUP_ROUTES.push(
    <ModalRoute
      key="segmented/group/:groupId"
      path="segmented/group/:groupId"
      modal={EditSandboxingModal}
    />,
  );
  PLUGIN_ADMIN_PERMISSIONS_TABLE_FIELDS_OPTIONS.push(OPTION_SEGMENTED);
  PLUGIN_ADMIN_PERMISSIONS_TABLE_FIELDS_ACTIONS["controlled"].push({
    label: t`Edit sandboxed access`,
    iconColor: "brand",
    icon: "pencil",
    actionCreator: (entityId, groupId, view) =>
      push(getEditSegementedAccessUrl(entityId, groupId, view)),
  });
  PLUGIN_ADMIN_PERMISSIONS_TABLE_FIELDS_POST_ACTION["controlled"] =
    getEditSegmentedAccessPostAction;
  PLUGIN_ADMIN_PERMISSIONS_TABLE_FIELDS_PERMISSION_VALUE["controlled"] = {
    read: "all",
    query: "segmented",
  };

  PLUGIN_DATA_PERMISSIONS.getPermissionsPayloadExtraData = state => {
    const sandboxes = getDraftPolicies(state);
    return {
      sandboxes,
    };
  };

  PLUGIN_DATA_PERMISSIONS.hasChanges = hasPolicyChanges;
  PLUGIN_REDUCERS.sandboxingPlugin = sandboxingReducer;
}
