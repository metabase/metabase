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
  useDataPermissionsSidebar,
  useDataPermissionsState,
  useDatabasesPermissionsEditor,
} from "../../hooks";
import type { DataPermissionValue, PermissionSectionConfig } from "../../types";
import type { DatabasePermissionInfo } from "../../utils/database-metadata";
import {
  DATABASES_BASE_PATH,
  getDatabaseFocusPermissionsUrl,
} from "../../utils/urls";

type DatabasesPermissionsPageProps = {
  params: {
    databaseId?: string;
    schemaName?: string;
    tableId?: string;
  };
  children?: React.ReactNode;
};

export function DatabasesPermissionsPage({
  params,
  children,
}: DatabasesPermissionsPageProps) {
  const dispatch = useDispatch();

  const databaseId = params.databaseId ? parseInt(params.databaseId) : undefined;
  const tableId = params.tableId ? parseInt(params.tableId) : undefined;

  // Use RTK Query hook for sidebar
  const {
    sidebar,
    isLoading: isSidebarLoading,
    error: sidebarError,
  } = useDataPermissionsSidebar({
    databaseId,
    schemaName: params.schemaName,
    tableId: params.tableId,
  });

  // Use the new editor hook
  const permissionEditor = useDatabasesPermissionsEditor({
    databaseId,
    schemaName: params.schemaName,
    tableId,
  });

  // Use the data permissions state for updates
  const { updateDataPermission } = useDataPermissionsState({});

  const showSplitPermsMessage = useSelector((state) =>
    getSetting(state, "show-updated-permission-banner"),
  );

  const isLoading = permissionEditor?.isLoading ?? false;

  const handleEntityChange = useCallback(
    (entityType: string) => {
      dispatch(push(`/admin/permissions/data/${entityType}`));
    },
    [dispatch],
  );

  const handleNavigateToItem = useCallback(
    (item: unknown) => {
      const sidebarItem = item as { entityId?: any };
      if (sidebarItem.entityId) {
        const url = getDatabaseFocusPermissionsUrl(sidebarItem.entityId);
        if (url) {
          dispatch(push(url));
        }
      }
    },
    [dispatch],
  );

  const handleNavigateToDatabaseList = useCallback(() => {
    dispatch(push(DATABASES_BASE_PATH));
  }, [dispatch]);

  const handlePermissionChange = useCallback(
    (
      item: { id: number | string; entityId: any; database: DatabasePermissionInfo },
      permission: PermissionSectionConfig,
      value: DataPermissionValue,
    ) => {
      const groupId = item.id as number;
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
    },
    [updateDataPermission],
  );

  const handleAction = useCallback(
    (action: { actionCreator: any }, item: { entityId: any; id: number | string }) => {
      dispatch(action.actionCreator(item.entityId, item.id, "database"));
    },
    [dispatch],
  );

  const handleBreadcrumbsItemSelect = useCallback(
    (item: { url: string }) => {
      dispatch(push(item.url));
    },
    [dispatch],
  );

  const showLegacyNoSelfServiceWarning =
    PLUGIN_ADVANCED_PERMISSIONS.shouldShowViewDataColumn &&
    !!permissionEditor?.hasLegacyNoSelfServiceValueInPermissionGraph;

  return (
    <Fragment>
      <PermissionsSidebar
        {...(sidebar ?? { entityGroups: [], filterPlaceholder: "" })}
        error={sidebarError ? String(sidebarError) : undefined}
        isLoading={isSidebarLoading}
        onSelect={handleNavigateToItem}
        onBack={databaseId == null ? undefined : handleNavigateToDatabaseList}
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
          isLoading={false}
          error={permissionEditor.error}
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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default DatabasesPermissionsPage;
