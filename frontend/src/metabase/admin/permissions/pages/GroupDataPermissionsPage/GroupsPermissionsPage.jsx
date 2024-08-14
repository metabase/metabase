import { bindActionCreators } from "@reduxjs/toolkit";
import PropTypes from "prop-types";
import { Fragment, useCallback } from "react";
import { connect } from "react-redux";
import { push } from "react-router-redux";
import { useAsync } from "react-use";
import { t } from "ttag";
import _ from "underscore";

import { PermissionsEditorLegacyNoSelfServiceWarning } from "metabase/admin/permissions/components/PermissionsEditor/PermissionsEditorLegacyWarning";
import { useSelector, useDispatch } from "metabase/lib/redux";
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
  LOAD_DATA_PERMISSIONS_FOR_GROUP,
} from "../../permissions";
import {
  getDatabasesPermissionEditor,
  getIsLoadingDatabaseTables,
  getLoadingDatabaseTablesError,
  getGroupsSidebar,
} from "../../selectors/data-permissions";
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
    isEditorLoading: getIsLoadingDatabaseTables(state, props),
    editorError: getLoadingDatabaseTablesError(state, props),
  };
};

const propTypes = {
  params: PropTypes.shape({
    groupId: PropTypes.string,
    databaseId: PropTypes.string,
    schemaName: PropTypes.string,
  }),
  children: PropTypes.node,
  sidebar: PropTypes.object,
  navigateToItem: PropTypes.func.isRequired,
  switchView: PropTypes.func.isRequired,
  navigateToTableItem: PropTypes.func.isRequired,
  updateDataPermission: PropTypes.func.isRequired,
  dispatch: PropTypes.func.isRequired,
  isEditorLoading: PropTypes.bool,
  editorError: PropTypes.string,
};

function GroupsPermissionsPage({
  sidebar,
  params,
  children,
  navigateToItem,
  switchView,
  navigateToTableItem,
  updateDataPermission,
  isEditorLoading,
  editorError,
}) {
  const dispatch = useDispatch();

  const { loading: isLoading } = useAsync(async () => {
    if (params.groupId) {
      const response = await PermissionsApi.graphForGroup({
        groupId: params.groupId,
      });
      await dispatch({
        type: LOAD_DATA_PERMISSIONS_FOR_GROUP,
        payload: response,
      });
    }
  }, [params.groupId]);

  const permissionEditor = useSelector(state =>
    getDatabasesPermissionEditor(state, { params }),
  );
  const showSplitPermsMessage = useSelector(state =>
    getSetting(state, "show-updated-permission-banner"),
  );

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
        groupId: parseInt(params.groupId),
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

  const showEmptyState = !permissionEditor && !isEditorLoading && !editorError;
  const showLegacyNoSelfServiceWarning =
    PLUGIN_ADVANCED_PERMISSIONS.shouldShowViewDataColumn &&
    !!permissionEditor?.hasLegacyNoSelfServiceValueInPermissionGraph;

  return (
    <Fragment>
      <PermissionsSidebar
        {...sidebar}
        onSelect={handleSidebarItemSelect}
        onEntityChange={handleEntityChange}
      />

      {isLoading && (
        <Center style={{ flexGrow: 1 }}>
          <Loader size="lg" />
        </Center>
      )}

      {showEmptyState && !isLoading && (
        <PermissionsEditorEmptyState
          icon="group"
          message={t`Select a group to see its data permissions`}
        />
      )}

      {!showEmptyState && !isLoading && (
        <PermissionsEditor
          {...permissionEditor}
          isLoading={isEditorLoading}
          error={editorError}
          onSelect={handleTableItemSelect}
          onChange={handlePermissionChange}
          onAction={handleAction}
          onBreadcrumbsItemSelect={handleBreadcrumbsItemSelect}
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

GroupsPermissionsPage.propTypes = propTypes;

export default _.compose(connect(mapStateToProps, mapDispatchToProps))(
  GroupsPermissionsPage,
);
