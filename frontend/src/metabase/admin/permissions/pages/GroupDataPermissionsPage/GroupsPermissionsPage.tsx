import { Fragment, useCallback } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import { PermissionsEditorLegacyNoSelfServiceWarning } from "metabase/admin/permissions/components/PermissionsEditor/PermissionsEditorLegacyWarning";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { PLUGIN_ADVANCED_PERMISSIONS } from "metabase/plugins";
import { getSetting } from "metabase/selectors/settings";
import { Center, Loader } from "metabase/ui";

import {
  PermissionsEditor,
  PermissionsEditorEmptyState,
} from "../../components/PermissionsEditor";
import { PermissionsEditorSplitPermsMessage } from "../../components/PermissionsEditor/PermissionsEditorSplitPermsMessage";
import { PermissionsSidebar } from "../../components/PermissionsSidebar";
import {
  useDataPermissionsState,
  useGroupsPermissionsEditor,
  useGroupsPermissionsSidebar,
} from "../../hooks";
import type { DataPermissionValue, PermissionSectionConfig } from "../../types";
import type { DatabasePermissionInfo } from "../../utils/database-metadata";
import {
  GROUPS_BASE_PATH,
  getGroupFocusPermissionsUrl,
} from "../../utils/urls";

type GroupsPermissionsPageProps = {
  params: {
    groupId?: string;
    databaseId?: string;
    schemaName?: string;
  };
  children?: React.ReactNode;
};

export function GroupsPermissionsPage({
  params,
  children,
}: GroupsPermissionsPageProps) {
  const dispatch = useDispatch();

  const groupId = params.groupId ? parseInt(params.groupId) : undefined;
  const databaseId = params.databaseId ? parseInt(params.databaseId) : undefined;

  // Use RTK Query hook for sidebar
  const {
    sidebar,
    isLoading: isSidebarLoading,
  } = useGroupsPermissionsSidebar({
    selectedGroupId: groupId,
  });

  // Use the new editor hook
  const permissionEditor = useGroupsPermissionsEditor({
    groupId,
    databaseId,
    schemaName: params.schemaName,
  });

  // Use the data permissions state for updates
  const { updateDataPermission } = useDataPermissionsState({ groupId });

  const showSplitPermsMessage = useSelector((state) =>
    getSetting(state, "show-updated-permission-banner"),
  );

  const isLoading = permissionEditor?.isLoading ?? false;

  const handleEntityChange = useCallback(
    (entityType: string) => {
      dispatch(push(`/admin/permissions/data/${entityType}/`));
    },
    [dispatch],
  );

  const handleSidebarItemSelect = useCallback(
    (item: { id: number | string }) => {
      dispatch(push(`${GROUPS_BASE_PATH}/${item.id}`));
    },
    [dispatch],
  );

  const handleTableItemSelect = useCallback(
    (item: { entityId: any }) => {
      if (groupId != null) {
        dispatch(push(getGroupFocusPermissionsUrl(groupId, item.entityId)));
      }
    },
    [dispatch, groupId],
  );

  const handlePermissionChange = useCallback(
    (
      item: { entityId: any; database: DatabasePermissionInfo },
      permission: PermissionSectionConfig,
      value: DataPermissionValue,
    ) => {
      if (groupId != null) {
        const postAction = updateDataPermission({
          groupId,
          permission,
          value,
          entityId: item.entityId,
          database: item.database,
        });
        // Execute any post-action (like navigation to granular permissions)
        if (postAction) {
          postAction();
        }
      }
    },
    [groupId, updateDataPermission],
  );

  const handleAction = useCallback(
    (action: { actionCreator: any }, item: { entityId: any }) => {
      dispatch(action.actionCreator(item.entityId, groupId, "group"));
    },
    [dispatch, groupId],
  );

  const handleBreadcrumbsItemSelect = useCallback(
    (item: { url: string }) => {
      dispatch(push(item.url));
    },
    [dispatch],
  );

  const showEmptyState = !permissionEditor && !isLoading;
  const showLegacyNoSelfServiceWarning =
    PLUGIN_ADVANCED_PERMISSIONS.shouldShowViewDataColumn &&
    !!permissionEditor?.hasLegacyNoSelfServiceValueInPermissionGraph;

  return (
    <Fragment>
      <PermissionsSidebar
        {...(sidebar ?? { entityGroups: [], filterPlaceholder: "" })}
        isLoading={isSidebarLoading}
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

      {permissionEditor && !isLoading && (
        <PermissionsEditor
          {...permissionEditor}
          isLoading={false}
          error={permissionEditor.error}
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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default GroupsPermissionsPage;
