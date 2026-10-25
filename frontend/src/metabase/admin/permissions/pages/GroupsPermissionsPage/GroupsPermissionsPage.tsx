import { Fragment, useCallback, useMemo } from "react";
import { t } from "ttag";

import { useListPermissionsGroupsQuery } from "metabase/api";
import { getPermissionsBasePath } from "metabase/common/components/PermissionsBasePath/base-path";
import type { ITreeNodeItem } from "metabase/common/components/tree/types";
import {
  type PermissionEditorBreadcrumb,
  type PermissionEditorEntity,
  type PermissionSectionConfig,
  PermissionsSidebar,
  type RawGroupRouteParams,
  getDatabasesPermissionEditor,
  getGroupFocusPermissionsUrl,
  getGroupsBasePath,
  getGroupsSidebar,
  parseGroupRouteParams,
  useDataPermissions,
  useLoadGroupDataPermissions,
  usePermissionsDatabase,
  useShouldShowTransformPermissions,
} from "metabase/permissions";
import {
  PLUGIN_ADVANCED_PERMISSIONS,
  type PermissionAction,
} from "metabase/plugins";
import { Outlet, useNavigate, useParams } from "metabase/router";
import { useSetting } from "metabase/settings";
import { Center, Loader } from "metabase/ui";
import type { DataPermissionValue } from "metabase-types/api";

import { PermissionsEditor } from "../../components/PermissionsEditor";
import { PermissionsEditorEmptyState } from "../../components/PermissionsEditorEmptyState";
import { PermissionsEditorLegacyNoSelfServiceWarning } from "../../components/PermissionsEditorLegacyNoSelfServiceWarning";
import { PermissionsEditorSplitPermsMessage } from "../../components/PermissionsEditorSplitPermsMessage";

export function GroupsPermissionsPage() {
  const navigate = useNavigate();
  const params = useParams<RawGroupRouteParams>();
  const groupRouteParams = useMemo(
    () =>
      parseGroupRouteParams({
        groupId: params.groupId,
        databaseId: params.databaseId,
        schemaName: params.schemaName,
      }),
    [params.groupId, params.databaseId, params.schemaName],
  );
  const { data: groups } = useListPermissionsGroupsQuery({});
  const { permissions, originalPermissions, updateDataPermission } =
    useDataPermissions();
  const {
    databases,
    database,
    isLoading: isEditorLoading,
    error: editorError,
  } = usePermissionsDatabase(groupRouteParams.databaseId);
  const { isLoading } = useLoadGroupDataPermissions(groupRouteParams.groupId);
  const showTransformPermissions = useShouldShowTransformPermissions();

  const sidebar = useMemo(
    () => getGroupsSidebar(groups ?? [], groupRouteParams.groupId),
    [groups, groupRouteParams.groupId],
  );

  const navigateToItem = (item: ITreeNodeItem) =>
    navigate(`${getGroupsBasePath()}/${item.id}`);

  const permissionEditor = useMemo(
    () =>
      permissions && originalPermissions && groups && !isEditorLoading
        ? getDatabasesPermissionEditor({
            params: groupRouteParams,
            databases,
            database,
            permissions,
            originalPermissions,
            groups,
            showTransformPermissions,
          })
        : null,
    [
      groupRouteParams,
      databases,
      database,
      permissions,
      originalPermissions,
      groups,
      isEditorLoading,
      showTransformPermissions,
    ],
  );
  const showSplitPermsMessage = useSetting("show-updated-permission-banner");

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
      updateDataPermission({
        groupId: groupRouteParams.groupId,
        permission,
        value,
        entityId: item.entityId,
        view: "group",
      });
    },
    [updateDataPermission, groupRouteParams.groupId],
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
