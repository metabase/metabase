import React, { useCallback } from "react";
import PropTypes from "prop-types";
import { bindActionCreators } from "redux";
import { push } from "react-router-redux";
import { t } from "ttag";
import _ from "underscore";
import { connect } from "react-redux";

import {
  getDatabasesPermissionEditor,
  getGroupsSidebar,
} from "../../selectors/data-permissions";
import { updateDataPermission } from "../../permissions";
import {
  PermissionsSidebar,
  permissionSidebarPropTypes,
} from "../../components/PermissionsSidebar";
import {
  PermissionsEditor,
  PermissionsEditorEmptyState,
  permissionEditorPropTypes,
} from "../../components/PermissionsEditor";
import {
  getGroupFocusPermissionsUrl,
  GROUPS_BASE_PATH,
} from "../../utils/urls";

const mapDispatchToProps = dispatch => ({
  dispatch,
  ...bindActionCreators(
    {
      updateDataPermission,
      switchView: entityType => push(`/admin/permissions/data/${entityType}/`),
      navigateToItem: item => push(`${GROUPS_BASE_PATH}/${item.id}`),
      navigateToTableItem: (item, { groupId }) => {
        return push(getGroupFocusPermissionsUrl(groupId, item.entityId));
      },
    },
    dispatch,
  ),
});

const mapStateToProps = (state, props) => {
  return {
    sidebar: getGroupsSidebar(state, props),
    permissionEditor: getDatabasesPermissionEditor(state, props),
  };
};

const propTypes = {
  params: PropTypes.shape({
    groupId: PropTypes.string,
    databaseId: PropTypes.string,
    schemaName: PropTypes.string,
  }),
  children: PropTypes.node.isRequired,
  sidebar: PropTypes.shape(permissionSidebarPropTypes),
  permissionEditor: PropTypes.shape(permissionEditorPropTypes),
  navigateToItem: PropTypes.func.isRequired,
  switchView: PropTypes.func.isRequired,
  navigateToTableItem: PropTypes.func.isRequired,
  updateDataPermission: PropTypes.func.isRequired,
  dispatch: PropTypes.func.isRequired,
  navigateToDatabase: PropTypes.func.isRequired,
};

function GroupsPermissionsPage({
  params,
  children,
  sidebar,
  permissionEditor,
  navigateToItem,
  switchView,
  navigateToTableItem,
  updateDataPermission,
  dispatch,
}) {
  const handleEntityChange = useCallback(
    entityType => {
      switchView(entityType);
    },
    [switchView],
  );

  const handleSidebarItemSelect = useCallback(
    item => {
      navigateToItem(item, params);
    },
    [navigateToItem, params],
  );

  const handleTableItemSelect = useCallback(
    item => {
      navigateToTableItem(item, params);
    },
    [navigateToTableItem, params],
  );

  const handlePermissionChange = useCallback(
    async (item, permission, value) => {
      await updateDataPermission({
        groupId: params.groupId,
        permission,
        value,
        entityId: item.entityId,
        view: "group",
      });
    },
    [params, updateDataPermission],
  );

  const handleAction = (action, item) => {
    dispatch(action.actionCreator(item.entityId, params.groupId, "group"));
  };

  const handleBreadcrumbsItemSelect = item => dispatch(push(item.url));

  return (
    <React.Fragment>
      <PermissionsSidebar
        {...sidebar}
        onSelect={handleSidebarItemSelect}
        onEntityChange={handleEntityChange}
      />

      {!permissionEditor && (
        <PermissionsEditorEmptyState
          icon="group"
          message={t`Select a group to see its data permissions`}
        />
      )}

      {permissionEditor && (
        <PermissionsEditor
          {...permissionEditor}
          onSelect={handleTableItemSelect}
          onChange={handlePermissionChange}
          onAction={handleAction}
          onBreadcrumbsItemSelect={handleBreadcrumbsItemSelect}
        />
      )}

      {children}
    </React.Fragment>
  );
}

GroupsPermissionsPage.propTypes = propTypes;

export default _.compose(
  connect(
    mapStateToProps,
    mapDispatchToProps,
  ),
)(GroupsPermissionsPage);
