import { Fragment, useCallback } from "react";
import { useAsync } from "react-use";
import { t } from "ttag";

import { PermissionsEditorLegacyNoSelfServiceWarning } from "metabase/admin/permissions/components/PermissionsEditor/PermissionsEditorLegacyWarning";
import { getPermissionsBasePath } from "metabase/common/components/PermissionsBasePath/base-path";
import type { ITreeNodeItem } from "metabase/common/components/tree/types";
import {
  type DataTreeNodeItem,
  type PermissionAction,
  type PermissionEditorBreadcrumb,
  type PermissionEditorEntity,
  type PermissionSectionConfig,
  PermissionsSidebar,
  type RawDataRouteParams,
  assertNumericId,
  getDatabaseFocusPermissionsUrl,
  getGroupsDataPermissionEditor,
  getIsLoadingDatabaseTables,
  getLoadingDatabaseTablesError,
  isEmbeddingHubPermissions,
  loadDataPermissionsForDb,
  parseDataRouteParams,
  updateDataPermission,
} from "metabase/permissions";
import { PLUGIN_ADVANCED_PERMISSIONS } from "metabase/plugins";
import { useDispatch, useSelector } from "metabase/redux";
import { Outlet, useNavigate, useParams } from "metabase/router";
import { getSetting } from "metabase/settings";
import { Center, Loader } from "metabase/ui";
import type { DataPermissionValue } from "metabase-types/api";

import {
  PermissionsEditor,
  PermissionsEditorEmptyState,
} from "../../components/PermissionsEditor";
import { PermissionsEditorSplitPermsMessage } from "../../components/PermissionsEditor/PermissionsEditorSplitPermsMessage";

import { useDatabasesTreeSidebar } from "./useDatabasesTreeSidebar";

export function DatabasesPermissionsPage() {
  const dispatch = useDispatch();
  const navigate = useNavigate();

  // These selectors resolve the focused database/schema/table from the route,
  // so they take the route params rather than reading them from the store.
  const params = useParams<RawDataRouteParams>();
  const selectorProps = { params };
  const sidebar = useDatabasesTreeSidebar(params);
  const editorError = useSelector((state) =>
    getLoadingDatabaseTablesError(state, selectorProps),
  );
  const isEditorLoading = useSelector((state) =>
    getIsLoadingDatabaseTables(state, selectorProps),
  );

  const dataRouteParams = parseDataRouteParams(params);
  const permissionEditor = useSelector((state) =>
    getGroupsDataPermissionEditor(state, { params: dataRouteParams }),
  );

  const navigateToItem = (item: ITreeNodeItem) =>
    navigate(
      getDatabaseFocusPermissionsUrl(
        // The sidebar types `onSelect` with the base tree item, but every node
        // it renders here comes from `getDatabasesTreeSidebar`, which builds
        // `DataTreeNodeItem`s carrying an `entityId`.
        (item as DataTreeNodeItem).entityId,
      ),
    );

  const showSplitPermsMessage = useSelector((state) =>
    getSetting(state, "show-updated-permission-banner"),
  );

  const { loading: isLoading } = useAsync(async () => {
    if (dataRouteParams.databaseId) {
      await dispatch(loadDataPermissionsForDb(dataRouteParams.databaseId));
    }
  }, [dataRouteParams.databaseId]);

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
      dispatch(
        updateDataPermission({
          groupId: assertNumericId(item.id),
          permission,
          value,
          entityId: item.entityId,
          view: "database",
        }),
      );
    },
    [dispatch],
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

  // The tree stays put while a newly selected database's tables load, so the
  // editor area carries the spinner.
  const isBusy = isLoading || isEditorLoading;

  return (
    <Fragment>
      <PermissionsSidebar
        {...sidebar}
        entityViewFocus="database"
        onSelect={navigateToItem}
        // Admin picks "By group" / "By database" from the side nav instead.
        onEntityChange={
          isEmbeddingHubPermissions() ? handleEntityChange : undefined
        }
      />
      {isBusy && (
        <Center style={{ flexGrow: 1 }}>
          <Loader size="lg" />
        </Center>
      )}
      {!permissionEditor && !isBusy && (
        <PermissionsEditorEmptyState
          icon="database"
          message={
            editorError ??
            t`Select a database, schema, or table to see group permissions`
          }
        />
      )}

      {permissionEditor && !isBusy && (
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
