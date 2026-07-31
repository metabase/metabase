import { Fragment, useCallback } from "react";
import { useAsync } from "react-use";
import { t } from "ttag";

import { PermissionsEditorLegacyNoSelfServiceWarning } from "metabase/admin/permissions/components/PermissionsEditor/PermissionsEditorLegacyWarning";
import type { ITreeNodeItem } from "metabase/common/components/tree/types";
import { PLUGIN_ADVANCED_PERMISSIONS } from "metabase/plugins";
import { useDispatch, useSelector } from "metabase/redux";
import { Outlet, push, useParams } from "metabase/router";
import { getSetting } from "metabase/selectors/settings";
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
import {
  GROUPS_BASE_PATH,
  getGroupFocusPermissionsUrl,
} from "../../utils/urls";

export function GroupsPermissionsPage() {
  const dispatch = useDispatch();

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
    dispatch(push(`${GROUPS_BASE_PATH}/${item.id}`));

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
      dispatch(push(`/admin/permissions/data/${entityType}/`));
    },
    [dispatch],
  );

  const handleTableItemSelect = useCallback(
    (item: PermissionEditorEntity) => {
      if (groupRouteParams.groupId == null) {
        return;
      }
      dispatch(
        push(
          getGroupFocusPermissionsUrl(groupRouteParams.groupId, item.entityId),
        ),
      );
    },
    [dispatch, groupRouteParams.groupId],
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
    dispatch(
      action.actionCreator(item.entityId, groupRouteParams.groupId, "group"),
    );
  };

  const handleBreadcrumbsItemSelect = (item: PermissionEditorBreadcrumb) => {
    if (item.url) {
      dispatch(push(item.url));
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
