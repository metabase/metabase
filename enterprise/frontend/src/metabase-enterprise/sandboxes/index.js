import {
  PLUGIN_ADMIN_USER_FORM_FIELDS,
  PLUGIN_ADMIN_PERMISSIONS_TABLE_ROUTES,
  PLUGIN_ADMIN_PERMISSIONS_TABLE_FIELDS_OPTIONS,
  PLUGIN_ADMIN_PERMISSIONS_TABLE_FIELDS_ACTIONS,
  PLUGIN_ADMIN_PERMISSIONS_TABLE_FIELDS_POST_ACTION,
  PLUGIN_ADMIN_PERMISSIONS_TABLE_FIELDS_PERMISSION_VALUE,
} from "metabase/plugins";

import React from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import { hasPremiumFeature } from "metabase-enterprise/settings";
import { color, alpha } from "metabase/lib/colors";

import { ModalRoute } from "metabase/hoc/ModalRoute";
import LoginAttributesWidget from "./components/LoginAttributesWidget";
import GTAPModal from "./components/GTAPModal";

const OPTION_BLUE = {
  iconColor: color("brand"),
  bgColor: alpha(color("brand"), 0.15),
};

const OPTION_SEGMENTED = {
  ...OPTION_BLUE,
  value: "controlled",
  title: t`Grant sandboxed access`,
  tooltip: t`Sandboxed access`,
  icon: "permissions_limited",
};

const getEditSegementedAccessUrl = (
  groupId,
  { databaseId, schemaName, tableId },
) =>
  `/admin/permissions` +
  `/databases/${databaseId}` +
  (schemaName ? `/schemas/${encodeURIComponent(schemaName)}` : "") +
  `/tables/${tableId}/segmented/group/${groupId}`;

const getEditSegementedAccessAction = (groupId, entityId) => ({
  ...OPTION_BLUE,
  title: t`Edit sandboxed access`,
  icon: "pencil",
  value: push(getEditSegementedAccessUrl(groupId, entityId)),
});

const getEditSegmentedAcessPostAction = (groupId, entityId) =>
  push(getEditSegementedAccessUrl(groupId, entityId));

if (hasPremiumFeature("sandboxes")) {
  PLUGIN_ADMIN_USER_FORM_FIELDS.push({
    name: "login_attributes",
    title: "Attributes",
    type: LoginAttributesWidget,
  });
  PLUGIN_ADMIN_PERMISSIONS_TABLE_ROUTES.push(
    <ModalRoute path=":tableId/segmented/group/:groupId" modal={GTAPModal} />,
  );
  PLUGIN_ADMIN_PERMISSIONS_TABLE_FIELDS_OPTIONS.push(OPTION_SEGMENTED);
  PLUGIN_ADMIN_PERMISSIONS_TABLE_FIELDS_ACTIONS["controlled"].push(
    getEditSegementedAccessAction,
  );
  PLUGIN_ADMIN_PERMISSIONS_TABLE_FIELDS_POST_ACTION[
    "controlled"
  ] = getEditSegmentedAcessPostAction;
  PLUGIN_ADMIN_PERMISSIONS_TABLE_FIELDS_PERMISSION_VALUE["controlled"] = {
    read: "all",
    query: "segmented",
  };
}
