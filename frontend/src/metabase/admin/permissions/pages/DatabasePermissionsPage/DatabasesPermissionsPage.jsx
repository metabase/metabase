import React, { useCallback } from "react";
import PropTypes from "prop-types";
import { bindActionCreators } from "redux";
import { push } from "react-router-redux";
import { t } from "ttag";
import _ from "underscore";
import { connect } from "react-redux";

import {
  getGroupsDataPermissionEditor,
  getDatabasesSidebar,
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
    databaseId: PropTypes.string,
    schemaName: PropTypes.string,
    tableId: PropTypes.string,
  }),
  children: PropTypes.node.isRequired,
  sidebar: PropTypes.shape(permissionSidebarPropTypes),
  permissionEditor: PropTypes.shape(permissionEditorPropTypes),
  navigateToItem: PropTypes.func.isRequired,
  switchView: PropTypes.func.isRequired,
  updateDataPermission: PropTypes.func.isRequired,
  navigateToDatabaseList: PropTypes.func.isRequired,
  dispatch: PropTypes.func.isRequired,
};

function DatabasesPermissionsPage({
  sidebar,
  permissionEditor,
  params,
  children,
  navigateToItem,
  navigateToDatabaseList,
  switchView,
  updateDataPermission,
  dispatch,
}) {
  const handleEntityChange = useCallback(
    entityType => {
      switchView(entityType);
    },
    [switchView],
  );

  const handlePermissionChange = useCallback(
    async (item, permission, value) => {
      await updateDataPermission({
        groupId: item.id,
        permission,
        value,
        entityId: params,
        view: "database",
      });
    },
    [params, updateDataPermission],
  );

  const handleAction = (action, item) => {
    dispatch(action.actionCreator(item.id, params, "database"));
  };

  return (
    <React.Fragment>
      <PermissionsSidebar
        {...sidebar}
        onSelect={navigateToItem}
        onBack={params.databaseId == null ? null : navigateToDatabaseList}
        onEntityChange={handleEntityChange}
      />

      {!permissionEditor && (
        <PermissionsEditorEmptyState
          icon="database"
          message={t`Select a database to see group permissions`}
        />
      )}

      {permissionEditor && (
        <PermissionsEditor
          {...permissionEditor}
          onBreadcrumbsItemSelect={navigateToItem}
          onChange={handlePermissionChange}
          onAction={handleAction}
        />
      )}

      {children}
    </React.Fragment>
  );
}

DatabasesPermissionsPage.propTypes = propTypes;

const BASE_PATH = `/admin/permissions/data/database/`;

const mapDispatchToProps = dispatch => ({
  dispatch,
  ...bindActionCreators(
    {
      updateDataPermission,
      switchView: entityType => push(`/admin/permissions/data/${entityType}`),
      navigateToDatabaseList: () => push(BASE_PATH),
      navigateToItem: item => {
        switch (item.type) {
          case "database":
            return push(`${BASE_PATH}${item.id}`);
          case "schema":
            return push(`${BASE_PATH}${item.databaseId}/schema/${item.name}`);
          case "table": {
            const hasSchema = item.schemaName != null;
            const url = hasSchema
              ? `${BASE_PATH}${item.databaseId}/schema/${item.schemaName}/table/${item.originalId}`
              : `${BASE_PATH}${item.databaseId}/table/${item.originalId}`;

            return push(url);
          }
        }

        return push(BASE_PATH);
      },
    },
    dispatch,
  ),
});

const mapStateToProps = (state, props) => {
  return {
    sidebar: getDatabasesSidebar(state, props),
    permissionEditor: getGroupsDataPermissionEditor(state, props),
  };
};

export default _.compose(
  connect(
    mapStateToProps,
    mapDispatchToProps,
  ),
)(DatabasesPermissionsPage);
