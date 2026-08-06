import { Fragment, useCallback } from "react";
import { useAsync } from "react-use";
import { t } from "ttag";

import { PermissionsEditorLegacyNoSelfServiceWarning } from "metabase/admin/permissions/components/PermissionsEditor/PermissionsEditorLegacyWarning";
import type { ITreeNodeItem } from "metabase/common/components/tree/types";
import { PLUGIN_ADVANCED_PERMISSIONS } from "metabase/plugins";
import { useDispatch, useSelector } from "metabase/redux";
import { Outlet, useNavigate, useParams } from "metabase/router";
import { getSetting } from "metabase/settings";
import { Center, Loader } from "metabase/ui";

import {
  PermissionsEditor,
  PermissionsEditorEmptyState,
} from "../../components/PermissionsEditor";
import { PermissionsEditorSplitPermsMessage } from "../../components/PermissionsEditor/PermissionsEditorSplitPermsMessage";
import { PermissionsSidebar } from "../../components/PermissionsSidebar";
import {
  loadDataPermissionsForGroup,
  updateDataPermission,
} from "../../permissions";
import {
  getDatabasesPermissionEditor,
  getGroupsSidebar,
  getIsLoadingDatabaseTables,
  getLoadingDatabaseTablesError,
} from "../../selectors/data-permissions";
import type {
  DataPermissionValue,
  PermissionAction,
  PermissionEditorBreadcrumb,
  PermissionEditorEntity,
  PermissionSectionConfig,
  RawGroupRouteParams,
} from "../../types";
import { parseGroupRouteParams } from "../../types";
import { getPermissionsBasePath } from "../../utils/base-path";
import {
  getGroupFocusPermissionsUrl,
  getGroupsBasePath,
} from "../../utils/urls";

export function GroupsPermissionsPage() {
  const dispatch = useDispatch();
  const navigate = useNavigate();

  // These selectors resolve the focused group from the route, so they take the
  // route params rather than reading them from the store.
  const params = useParams<RawGroupRouteParams>();
  const selectorProps = { params };
  const sidebar = useSelector((state) =>
    getGroupsSidebar(state, selectorProps),
  );
  const isEditorLoading = useSelector((state) =>
    getIsLoadingDatabaseTables(state, selectorProps),
  );
  const editorError = useSelector((state) =>
    getLoadingDatabaseTablesError(state, selectorProps),
  );

  const groupRouteParams = parseGroupRouteParams(params);

  const navigateToItem = (item: ITreeNodeItem) =>
    navigate(`${getGroupsBasePath()}/${item.id}`);

  const { loading: isLoading } = useAsync(async () => {
    if (groupRouteParams.groupId) {
      await dispatch(loadDataPermissionsForGroup(groupRouteParams.groupId));
    }
  }, [groupRouteParams.groupId]);

  const permissionEditor = useSelector((state) =>
    getDatabasesPermissionEditor(state, { params }),
  );
  const showSplitPermsMessage = useSelector((state) =>
    getSetting(state, "show-updated-permission-banner"),
  );

  const handleEntityChange = useCallback(
    (entityType: string) => {
      navigate(`${getPermissionsBasePath()}/data/${entityType}/`);
    },
    [navigate],
  );

  const handleTableItemSelect = useCallback(
    (item: PermissionEditorEntity) => {
      if (groupRouteParams.groupId == null) {
        return;
      }
      navigate(
        getGroupFocusPermissionsUrl(groupRouteParams.groupId, item.entityId),
      );
    },
    [groupRouteParams.groupId, navigate],
  );

  const handlePermissionChange = useCallback(
    (
      item: PermissionEditorEntity,
      permission: PermissionSectionConfig,
      value: DataPermissionValue,
    ) => {
      if (item.entityId == null || groupRouteParams.groupId == null) {
        return;
      }
      dispatch(
        updateDataPermission({
          groupId: groupRouteParams.groupId,
          permission,
          value,
          entityId: item.entityId,
          view: "group",
        }),
      );
    },
    [dispatch, groupRouteParams.groupId],
  );

  const handleAction = (
    action: PermissionAction,
    item: PermissionEditorEntity,
  ) => {
    if (groupRouteParams.groupId == null) {
      return;
    }
    action.onSelect(item.entityId, groupRouteParams.groupId, "group");
  };

  const handleBreadcrumbsItemSelect = (item: PermissionEditorBreadcrumb) => {
    if (item.url) {
      navigate(item.url);
    }
  };

  const showLegacyNoSelfServiceWarning =
    PLUGIN_ADVANCED_PERMISSIONS.shouldShowViewDataColumn &&
    !!permissionEditor?.hasLegacyNoSelfServiceValueInPermissionGraph;

  return (
    <Fragment>
      <PermissionsSidebar
        {...sidebar}
        onSelect={navigateToItem}
        onEntityChange={handleEntityChange}
      />

      {isLoading && (
        <Center style={{ flexGrow: 1 }}>
          <Loader size="lg" />
        </Center>
      )}

      {!permissionEditor && !isLoading && (
        <PermissionsEditorEmptyState
          icon="group"
          message={t`Select a group to see its data permissions`}
        />
      )}

      {permissionEditor && !isLoading && (
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

      <Outlet />
    </Fragment>
  );
}
