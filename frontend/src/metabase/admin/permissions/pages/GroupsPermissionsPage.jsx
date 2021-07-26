/* eslint-disable react/prop-types */
import React from "react";
import { push } from "react-router-redux";
import _ from "underscore";

import Group from "metabase/entities/groups";

import { connect } from "react-redux";

import {
  updatePermission,
  savePermissions,
  loadPermissions,
} from "../permissions";
import { PermissionsPageLayout } from "../components/permissions-page-layout/PermissionsPageLayout";
import GroupsSidebar from "../components/groups-sidebar/GroupsSidebar";
import { PermissionEditorEmptyState } from "../components/permission-editor/PermissionEditorEmptyState";

function GroupsPermissionsPage({ params, onChangeTab }) {
  return (
    <PermissionsPageLayout tab="data" onChangeTab={onChangeTab}>
      <GroupsSidebar selectedId={params.groupId} />
      <PermissionEditorEmptyState
        icon="group"
        message="Select a group to see it's data permissions"
      />
    </PermissionsPageLayout>
  );
}

const mapDispatchToProps = {
  onUpdatePermission: updatePermission,
  onSave: savePermissions,
  onCancel: loadPermissions,
  loadGroups: Group.actions.fetchList,
  onChangeTab: tab => push(`/admin/permissions/${tab}`),
};

export default _.compose(
  connect(
    null,
    mapDispatchToProps,
  ),
  Group.loadList(),
)(GroupsPermissionsPage);
