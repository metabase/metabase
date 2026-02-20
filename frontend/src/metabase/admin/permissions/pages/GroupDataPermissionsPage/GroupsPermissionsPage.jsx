import { bindActionCreators } from "@reduxjs/toolkit";
import PropTypes from "prop-types";
import { Fragment, useCallback } from "react";
import { useAsync } from "react-use";
import { t } from "ttag";
import _ from "underscore";

import { PermissionsEditorLegacyNoSelfServiceWarning } from "metabase/admin/permissions/components/PermissionsEditor/PermissionsEditorLegacyWarning";
import { connect, useDispatch, useSelector } from "metabase/lib/redux";
import { PLUGIN_ADVANCED_PERMISSIONS } from "metabase/plugins";
import { useNavigation } from "metabase/routing/compat";
import { getSetting } from "metabase/selectors/settings";
import { PermissionsApi } from "metabase/services";
import { Center, Loader } from "metabase/ui";

import {
  PermissionsEditor,
  PermissionsEditorEmptyState,
} from "../../components/PermissionsEditor";
import { PermissionsEditorSplitPermsMessage } from "../../components/PermissionsEditor/PermissionsEditorSplitPermsMessage";
import { PermissionsSidebar } from "../../components/PermissionsSidebar";
import {
  LOAD_DATA_PERMISSIONS_FOR_GROUP,
  updateDataPermission,
} from "../../permissions";
import {
  getDatabasesPermissionEditor,
  getGroupsSidebar,
  getIsLoadingDatabaseTables,
  getLoadingDatabaseTablesError,
} from "../../selectors/data-permissions";
import {
  GROUPS_BASE_PATH,
  getGroupFocusPermissionsUrl,
} from "../../utils/urls";

const mapDispatchToProps = (dispatch) => ({
  dispatch,
  ...bindActionCreators(
    {
      updateDataPermission,
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

function GroupsPermissionsPageInner({
  sidebar,
  params,
  children,
  updateDataPermission,
  isEditorLoading,
  editorError,
}) {
  const dispatch = useDispatch();
  const { push } = useNavigation();

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

  const permissionEditor = useSelector((state) =>
    getDatabasesPermissionEditor(state, { params }),
  );
  const showSplitPermsMessage = useSelector((state) =>
    getSetting(state, "show-updated-permission-banner"),
  );

  const handleEntityChange = useCallback(
    (entityType) => {
      push(`/admin/permissions/data/${entityType}/`);
    },
    [push],
  );

  const handleSidebarItemSelect = useCallback(
    (item) => {
      push(`${GROUPS_BASE_PATH}/${item.id}`);
    },
    [push],
  );

  const handleTableItemSelect = useCallback(
    (item) => {
      push(getGroupFocusPermissionsUrl(params.groupId, item.entityId));
    },
    [params.groupId, push],
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

  const handleBreadcrumbsItemSelect = (item) => push(item.url);

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

GroupsPermissionsPageInner.propTypes = propTypes;

export const GroupsPermissionsPage = _.compose(
  connect(mapStateToProps, mapDispatchToProps),
)(GroupsPermissionsPageInner);
