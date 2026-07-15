import { t } from "ttag";
import _ from "underscore";

import { isTableEntityId } from "metabase/admin/permissions/utils/data-entity-id";
import {
  getDatabaseFocusPermissionsUrl,
  getGroupFocusPermissionsUrl,
} from "metabase/admin/permissions/utils/urls";
import { modalRoute } from "metabase/common/components/ModalRoute";
import {
  PLUGIN_ADMIN_PERMISSIONS_TABLE_FIELDS_ACTIONS,
  PLUGIN_ADMIN_PERMISSIONS_TABLE_FIELDS_CONFIRMATIONS,
  PLUGIN_ADMIN_PERMISSIONS_TABLE_FIELDS_OPTIONS,
  PLUGIN_ADMIN_PERMISSIONS_TABLE_FIELDS_POST_ACTION,
  PLUGIN_ADMIN_PERMISSIONS_TABLE_GROUP_ROUTES,
  PLUGIN_ADMIN_PERMISSIONS_TABLE_ROUTES,
  PLUGIN_ADMIN_USER_FORM_FIELDS,
  PLUGIN_DATA_PERMISSIONS,
  PLUGIN_REDUCERS,
  type PermissionOption,
} from "metabase/plugins";
import { push } from "metabase/router";
import { hasPremiumFeature } from "metabase-enterprise/settings";
import type {
  GroupId,
  PermissionEntityId,
  TableEntityId,
} from "metabase-types/api";
import { DataPermissionValue } from "metabase-types/api";

import sandboxingReducer from "./actions";
import { LoginAttributesWidget } from "./components/LoginAttributesWidget/LoginAttributesWidget";
import { getSandboxedTableWarningModal } from "./confirmations";
import EditSandboxingModal from "./containers/EditSandboxingModal";
import { getDraftPolicies, hasPolicyChanges } from "./selectors";

const OPTION_SEGMENTED = {
  // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
  label: t`Row and column security`,
  value: DataPermissionValue.SANDBOXED,
  icon: "permissions_limited",
  iconColor: "brand",
} satisfies PermissionOption;

const getDatabaseViewSandboxModalUrl = (
  entityId: TableEntityId,
  groupId: GroupId,
) => {
  const baseUrl = getDatabaseFocusPermissionsUrl(entityId);
  return `${baseUrl}/segmented/group/${groupId}`;
};

const getGroupViewSandboxModalUrl = (
  entityId: TableEntityId,
  groupId: GroupId,
) => {
  // the group view URL nests the table segment after the group, so the helper
  // gets only the schema-level ids
  const { tableId, ...schemaEntityId } = entityId;
  const baseUrl = getGroupFocusPermissionsUrl(groupId, schemaEntityId);
  return `${baseUrl}/${tableId}/segmented`;
};

const getEditSegementedAccessUrl = (
  entityId: PermissionEntityId | undefined,
  groupId: GroupId,
  view: "database" | "group",
) => {
  if (entityId == null || !isTableEntityId(entityId)) {
    throw new Error("Sandboxing can only be configured for tables");
  }

  return view === "database"
    ? getDatabaseViewSandboxModalUrl(entityId, groupId)
    : getGroupViewSandboxModalUrl(entityId, groupId);
};

const getEditSegmentedAccessPostAction = (
  entityId: PermissionEntityId,
  groupId: GroupId,
  view: "database" | "group",
) => push(getEditSegementedAccessUrl(entityId, groupId, view));

/**
 * Initialize sandboxes plugin features that depend on hasPremiumFeature.
 */
export function initializePlugin() {
  if (hasPremiumFeature("sandboxes")) {
    PLUGIN_ADMIN_USER_FORM_FIELDS.FormLoginAttributes = LoginAttributesWidget;

    PLUGIN_ADMIN_PERMISSIONS_TABLE_ROUTES.push(
      modalRoute(":tableId/segmented", EditSandboxingModal),
    );
    PLUGIN_ADMIN_PERMISSIONS_TABLE_GROUP_ROUTES.push(
      modalRoute("segmented/group/:groupId", EditSandboxingModal),
    );
    PLUGIN_ADMIN_PERMISSIONS_TABLE_FIELDS_OPTIONS.push(OPTION_SEGMENTED);
    PLUGIN_ADMIN_PERMISSIONS_TABLE_FIELDS_ACTIONS[OPTION_SEGMENTED.value].push({
      label: t`Edit row and column security`,
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

    PLUGIN_DATA_PERMISSIONS.permissionsPayloadExtraSelectors.push((state) => {
      const sandboxes = getDraftPolicies(state);
      const modifiedGroupIds = _.uniq(
        sandboxes.map((sb) => String(sb.group_id)),
      );
      return [{ sandboxes }, modifiedGroupIds];
    });

    PLUGIN_DATA_PERMISSIONS.hasChanges.push(hasPolicyChanges);
    PLUGIN_REDUCERS.sandboxingPlugin = sandboxingReducer;
  }
}
