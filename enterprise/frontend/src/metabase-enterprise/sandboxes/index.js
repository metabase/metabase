import {
  PLUGIN_ADMIN_USER_FORM_FIELDS,
  PLUGIN_ADMIN_PERMISSIONS_TABLE_ROUTES,
  PLUGIN_ADMIN_PERMISSIONS_TABLE_GROUP_ROUTES,
  PLUGIN_ADMIN_PERMISSIONS_TABLE_FIELDS_OPTIONS,
  PLUGIN_ADMIN_PERMISSIONS_TABLE_FIELDS_ACTIONS,
  PLUGIN_ADMIN_PERMISSIONS_TABLE_FIELDS_POST_ACTION,
  PLUGIN_ADMIN_PERMISSIONS_TABLE_FIELDS_PERMISSION_VALUE,
} from "metabase/plugins";

import React from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import { hasPremiumFeature } from "metabase-enterprise/settings";
import { color } from "metabase/lib/colors";

import { ModalRoute } from "metabase/hoc/ModalRoute";
import LoginAttributesWidget from "./components/LoginAttributesWidget";
import GTAPModal from "./components/GTAPModal";

const OPTION_SEGMENTED = {
  label: t`Sandboxed`,
  value: "controlled",
  icon: "permissions_limited",
  iconColor: color("brand"),
};

const getDatabaseViewSandboxModalUrl = ({
  groupId,
  databaseId,
  schemaName,
  tableId,
}) =>
  `/admin/permissions/data/database/${databaseId}/schema/${encodeURIComponent(
    schemaName,
  )}/table/${tableId}/segmented/group/${groupId}`;

const getGroupViewSandboxModalUrl = ({
  groupId,
  databaseId,
  schemaName,
  tableId,
}) =>
  `/admin/permissions/data/group/${groupId}/database/${databaseId}/schema/${encodeURIComponent(
    schemaName,
  )}/${tableId}/segmented`;

const getEditSegementedAccessUrl = (params, view) =>
  view === "database"
    ? getDatabaseViewSandboxModalUrl(params)
    : getGroupViewSandboxModalUrl(params);

const getEditSegmentedAcessPostAction = (params, view) =>
  push(getEditSegementedAccessUrl(params, view));

if (hasPremiumFeature("sandboxes")) {
  PLUGIN_ADMIN_USER_FORM_FIELDS.push({
    name: "login_attributes",
    title: "Attributes",
    type: LoginAttributesWidget,
  });
  PLUGIN_ADMIN_PERMISSIONS_TABLE_ROUTES.push(
    <ModalRoute path=":tableId/segmented" modal={GTAPModal} />,
  );
  PLUGIN_ADMIN_PERMISSIONS_TABLE_GROUP_ROUTES.push(
    <ModalRoute path="segmented/group/:groupId" modal={GTAPModal} />,
  );
  PLUGIN_ADMIN_PERMISSIONS_TABLE_FIELDS_OPTIONS.push(OPTION_SEGMENTED);
  PLUGIN_ADMIN_PERMISSIONS_TABLE_FIELDS_ACTIONS["controlled"].push({
    label: t`Edit sandboxed access`,
    iconColor: color("brand"),
    icon: "pencil",
    actionCreator: (groupId, entityId, view) =>
      push(getEditSegementedAccessUrl({ ...entityId, groupId }, view)),
  });
  PLUGIN_ADMIN_PERMISSIONS_TABLE_FIELDS_POST_ACTION[
    "controlled"
  ] = getEditSegmentedAcessPostAction;
  PLUGIN_ADMIN_PERMISSIONS_TABLE_FIELDS_PERMISSION_VALUE["controlled"] = {
    read: "all",
    query: "segmented",
  };
}
