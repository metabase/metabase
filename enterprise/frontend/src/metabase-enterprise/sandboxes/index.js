import { push } from "react-router-redux";
import { t } from "ttag";
import _ from "underscore";

import { DataPermissionValue } from "metabase/admin/permissions/types";
import {
  getDatabaseFocusPermissionsUrl,
  getGroupFocusPermissionsUrl,
} from "metabase/admin/permissions/utils/urls";
import { ModalRoute } from "metabase/hoc/ModalRoute";
import {
  PLUGIN_ADMIN_PERMISSIONS_TABLE_FIELDS_ACTIONS,
  PLUGIN_ADMIN_PERMISSIONS_TABLE_FIELDS_CONFIRMATIONS,
  PLUGIN_ADMIN_PERMISSIONS_TABLE_FIELDS_POST_ACTION,
  PLUGIN_ADMIN_PERMISSIONS_TABLE_FIELDS_VIEW_DATA_OPTIONS,
  PLUGIN_ADMIN_PERMISSIONS_TABLE_GROUP_ROUTES,
  PLUGIN_ADMIN_PERMISSIONS_TABLE_ROUTES,
  PLUGIN_ADMIN_USER_FORM_FIELDS,
  PLUGIN_DATA_PERMISSIONS,
  PLUGIN_REDUCERS,
} from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import sandboxingReducer from "./actions";
import { LoginAttributesWidget } from "./components/LoginAttributesWidget";
import { getSandboxedTableWarningModal } from "./confirmations";
import EditSandboxingModal from "./containers/EditSandboxingModal";
import { getDraftPolicies, hasPolicyChanges } from "./selectors";

const OPTION_SEGMENTED = {
  label: t`Sandboxed`,
  value: DataPermissionValue.SANDBOXED,
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
  PLUGIN_ADMIN_USER_FORM_FIELDS.FormLoginAttributes = LoginAttributesWidget;

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
  PLUGIN_ADMIN_PERMISSIONS_TABLE_FIELDS_VIEW_DATA_OPTIONS.push(
    OPTION_SEGMENTED,
  );
  PLUGIN_ADMIN_PERMISSIONS_TABLE_FIELDS_ACTIONS[OPTION_SEGMENTED.value].push({
    label: t`Edit sandboxed access`,
    iconColor: "brand",
    icon: "pencil",
    actionCreator: (entityId, groupId, view) =>
      push(getEditSegementedAccessUrl(entityId, groupId, view)),
  });
  PLUGIN_ADMIN_PERMISSIONS_TABLE_FIELDS_CONFIRMATIONS.push(
    (permissions, groupId, entityId, newValue) =>
      getSandboxedTableWarningModal(permissions, groupId, entityId, newValue),
  );
  PLUGIN_ADMIN_PERMISSIONS_TABLE_FIELDS_POST_ACTION[OPTION_SEGMENTED.value] =
    getEditSegmentedAccessPostAction;

  PLUGIN_DATA_PERMISSIONS.permissionsPayloadExtraSelectors.push(state => {
    const sandboxes = getDraftPolicies(state);
    const modifiedGroupIds = _.uniq(sandboxes.map(sb => sb.group_id));
    return [{ sandboxes }, modifiedGroupIds];
  });

  PLUGIN_DATA_PERMISSIONS.hasChanges.push(hasPolicyChanges);
  PLUGIN_REDUCERS.sandboxingPlugin = sandboxingReducer;
}
