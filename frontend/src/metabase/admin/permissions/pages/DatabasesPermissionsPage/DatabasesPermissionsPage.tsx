import { Fragment, useCallback, useMemo } from "react";
import { t } from "ttag";

import { useListPermissionsGroupsQuery } from "metabase/api";
import { getPermissionsBasePath } from "metabase/common/components/PermissionsBasePath/base-path";
import type { ITreeNodeItem } from "metabase/common/components/tree/types";
import {
  type DataTreeNodeItem,
  type PermissionEditorBreadcrumb,
  type PermissionEditorEntity,
  type PermissionSectionConfig,
  PermissionsSidebar,
  type RawDataRouteParams,
  assertNumericId,
  getDataFocusSidebar,
  getDatabaseFocusPermissionsUrl,
  getDatabasesBasePath,
  getGroupsDataPermissionEditor,
  parseDataRouteParams,
  useDataPermissions,
  useLoadDatabaseDataPermissions,
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

export function DatabasesPermissionsPage() {
  const navigate = useNavigate();
  const params = useParams<RawDataRouteParams>();
  const dataRouteParams = useMemo(
    () =>
      parseDataRouteParams({
        databaseId: params.databaseId,
        schemaName: params.schemaName,
        tableId: params.tableId,
      }),
    [params.databaseId, params.schemaName, params.tableId],
  );
  const { data: groups } = useListPermissionsGroupsQuery({});
  const { permissions, originalPermissions, updateDataPermission } =
    useDataPermissions();
  const {
    databases,
    database,
    isLoading: isSidebarLoading,
    error: sidebarError,
  } = usePermissionsDatabase(dataRouteParams.databaseId);
  const { isLoading } = useLoadDatabaseDataPermissions(
    dataRouteParams.databaseId,
  );
  const showTransformPermissions = useShouldShowTransformPermissions();

  const sidebar = useMemo(
    () =>
      isSidebarLoading
        ? null
        : getDataFocusSidebar({ params, databases, database }),
    [isSidebarLoading, params, databases, database],
  );

  const permissionEditor = useMemo(
    () =>
      permissions && originalPermissions && groups
        ? getGroupsDataPermissionEditor({
            params: dataRouteParams,
            database,
            permissions,
            originalPermissions,
            groups,
            showTransformPermissions,
          })
        : null,
    [
      dataRouteParams,
      database,
      permissions,
      originalPermissions,
      groups,
      showTransformPermissions,
    ],
  );

  const navigateToItem = (item: ITreeNodeItem) =>
    navigate(
      getDatabaseFocusPermissionsUrl(
        // The sidebar types `onSelect` with the base tree item, but every node
        // it renders here comes from `getDataFocusSidebar`, which builds
        // `DataTreeNodeItem`s carrying an `entityId`.
        (item as DataTreeNodeItem).entityId,
      ),
    );
  const navigateToDatabaseList = () => navigate(getDatabasesBasePath());

  const showSplitPermsMessage = useSetting("show-updated-permission-banner");

  const handleEntityChange = useCallback(
    (entityType: string) => {
      navigate(`${getPermissionsBasePath()}/data/${entityType}`);
    },
    [navigate],
  );

  const handlePermissionChange = useCallback(
    (
      item: PermissionEditorEntity,
      permission: PermissionSectionConfig,
      value: DataPermissionValue,
    ) => {
      if (!item.entityId) {
        return;
      }
      updateDataPermission({
        groupId: assertNumericId(item.id),
        permission,
        value,
        entityId: item.entityId,
        view: "database",
      });
    },
    [updateDataPermission],
  );

  const handleAction = (
    action: PermissionAction,
    item: PermissionEditorEntity,
  ) => {
    action.onSelect(item.entityId, assertNumericId(item.id), "database");
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
        {...(sidebar ?? { entityGroups: [], filterPlaceholder: "" })}
        error={sidebarError}
        isLoading={isSidebarLoading}
        onSelect={navigateToItem}
        onBack={params.databaseId == null ? undefined : navigateToDatabaseList}
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

      <Outlet />
    </Fragment>
  );
}
