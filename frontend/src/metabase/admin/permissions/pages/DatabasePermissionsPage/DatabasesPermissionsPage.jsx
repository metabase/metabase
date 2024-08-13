import { bindActionCreators } from "@reduxjs/toolkit";
import PropTypes from "prop-types";
import { Fragment, useCallback } from "react";
import { connect } from "react-redux";
import { push } from "react-router-redux";
import { useAsync } from "react-use";
import { t } from "ttag";
import _ from "underscore";

import { PermissionsEditorLegacyNoSelfServiceWarning } from "metabase/admin/permissions/components/PermissionsEditor/PermissionsEditorLegacyWarning";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { PLUGIN_ADVANCED_PERMISSIONS } from "metabase/plugins";
import { getSetting } from "metabase/selectors/settings";
import { PermissionsApi } from "metabase/services";
import { Loader, Center } from "metabase/ui";

import {
  PermissionsEditor,
  PermissionsEditorEmptyState,
} from "../../components/PermissionsEditor";
import { PermissionsEditorSplitPermsMessage } from "../../components/PermissionsEditor/PermissionsEditorSplitPermsMessage";
import { PermissionsSidebar } from "../../components/PermissionsSidebar";
import {
  updateDataPermission,
  LOAD_DATA_PERMISSIONS_FOR_DB,
} from "../../permissions";
import {
  getGroupsDataPermissionEditor,
  getDataFocusSidebar,
  getIsLoadingDatabaseTables,
  getLoadingDatabaseTablesError,
} from "../../selectors/data-permissions";
import {
  DATABASES_BASE_PATH,
  getDatabaseFocusPermissionsUrl,
} from "../../utils/urls";

const mapDispatchToProps = dispatch => ({
  dispatch,
  ...bindActionCreators(
    {
      updateDataPermission,
      switchView: entityType => push(`/admin/permissions/data/${entityType}`),
      navigateToDatabaseList: () => push(DATABASES_BASE_PATH),
      navigateToItem: item =>
        push(getDatabaseFocusPermissionsUrl(item.entityId)),
    },
    dispatch,
  ),
});

const mapStateToProps = (state, props) => {
  return {
    sidebar: getDataFocusSidebar(state, props),
    isSidebarLoading: getIsLoadingDatabaseTables(state, props),
    sidebarError: getLoadingDatabaseTablesError(state, props),
  };
};

const propTypes = {
  params: PropTypes.shape({
    databaseId: PropTypes.string,
    schemaName: PropTypes.string,
    tableId: PropTypes.string,
  }),
  children: PropTypes.node,
  sidebar: PropTypes.object,
  navigateToItem: PropTypes.func.isRequired,
  switchView: PropTypes.func.isRequired,
  updateDataPermission: PropTypes.func.isRequired,
  navigateToDatabaseList: PropTypes.func.isRequired,
  isSidebarLoading: PropTypes.bool,
  sidebarError: PropTypes.string,
};

function DatabasesPermissionsPage({
  sidebar,
  params,
  children,
  navigateToItem,
  navigateToDatabaseList,
  switchView,
  updateDataPermission,
  isSidebarLoading,
  sidebarError,
}) {
  const dispatch = useDispatch();
  const permissionEditor = useSelector(state =>
    getGroupsDataPermissionEditor(state, { params }),
  );

  const showSplitPermsMessage = useSelector(state =>
    getSetting(state, "show-updated-permission-banner"),
  );

  const { loading: isLoading } = useAsync(async () => {
    if (params.databaseId) {
      const response = await PermissionsApi.graphForDB({
        databaseId: params.databaseId,
      });
      await dispatch({
        type: LOAD_DATA_PERMISSIONS_FOR_DB,
        payload: response,
      });
    }
  }, [params.databaseId]);

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
        entityId: item.entityId,
        view: "database",
      });
    },
    [updateDataPermission],
  );

  const handleAction = (action, item) => {
    dispatch(action.actionCreator(item.entityId, item.id, "database"));
  };

  const handleBreadcrumbsItemSelect = item => dispatch(push(item.url));

  const showLegacyNoSelfServiceWarning =
    PLUGIN_ADVANCED_PERMISSIONS.shouldShowViewDataColumn &&
    !!permissionEditor?.hasLegacyNoSelfServiceValueInPermissionGraph;

  return (
    <Fragment>
      <PermissionsSidebar
        {...sidebar}
        error={sidebarError}
        isLoading={isSidebarLoading}
        onSelect={navigateToItem}
        onBack={params.databaseId == null ? null : navigateToDatabaseList}
        onEntityChange={handleEntityChange}
      />
      {isLoading && (
        <Center style={{ flexGrow: 1 }}>
          <Loader size="lg" />
        </Center>
      )}
      {!permissionEditor && !isLoading && (
        <PermissionsEditorEmptyState
          icon="database"
          message={t`Select a database to see group permissions`}
        />
      )}

      {permissionEditor && !isLoading && (
        <PermissionsEditor
          {...permissionEditor}
          onBreadcrumbsItemSelect={handleBreadcrumbsItemSelect}
          onChange={handlePermissionChange}
          onAction={handleAction}
          preHeaderContent={() => (
            <>
              {showSplitPermsMessage && <PermissionsEditorSplitPermsMessage />}
            </>
          )}
          postHeaderContent={() => (
            <>
              {showLegacyNoSelfServiceWarning && (
                <PermissionsEditorLegacyNoSelfServiceWarning />
              )}
            </>
          )}
        />
      )}

      {children}
    </Fragment>
  );
}

DatabasesPermissionsPage.propTypes = propTypes;

export default _.compose(connect(mapStateToProps, mapDispatchToProps))(
  DatabasesPermissionsPage,
);
