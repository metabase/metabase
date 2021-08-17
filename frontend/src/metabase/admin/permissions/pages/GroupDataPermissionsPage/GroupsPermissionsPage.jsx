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
  navigateToDatabase,
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
      let entityId;

      switch (item.type) {
        case "database":
          entityId = { databaseId: item.id };
          break;
        case "schema":
          entityId = {
            databaseId: params.databaseId,
            schemaName: item.name,
          };
          break;
        case "table":
          entityId = {
            databaseId: params.databaseId,
            schemaName: params.schemaName,
            tableId: item.id,
          };
          break;
      }

      await updateDataPermission({
        groupId: params.groupId,
        permission,
        value,
        entityId,
        view: "group",
      });
    },
    [params, updateDataPermission],
  );

  const handleAction = (action, item) => {
    dispatch(
      action.actionCreator(
        params.groupId,
        {
          databaseId: params.databaseId,
          schemaName: params.schemaName,
          tableId: item.id,
        },
        "group",
      ),
    );
  };

  const handleBreadcrumbsItemSelect = item =>
    navigateToDatabase(params, item.id);

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
          message={t`Select a group to see it's data permissions`}
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

const BASE_PATH = `/admin/permissions/data/group`;

const mapDispatchToProps = dispatch => ({
  dispatch,
  ...bindActionCreators(
    {
      updateDataPermission,
      switchView: entityType => push(`/admin/permissions/data/${entityType}/`),
      navigateToItem: item => push(`${BASE_PATH}/${item.id}`),
      navigateToDatabase: (params, databaseId) =>
        push(`${BASE_PATH}/${params.groupId}/database/${databaseId}`),
      navigateToTableItem: (item, { groupId, databaseId }) => {
        if (item.type === "database") {
          return push(`${BASE_PATH}/${groupId}/database/${item.id}`);
        } else if (item.type === "schema") {
          return push(
            `${BASE_PATH}/${groupId}/database/${databaseId}/schema/${item.name}`,
          );
        }
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

export default _.compose(
  connect(
    mapStateToProps,
    mapDispatchToProps,
  ),
)(GroupsPermissionsPage);
