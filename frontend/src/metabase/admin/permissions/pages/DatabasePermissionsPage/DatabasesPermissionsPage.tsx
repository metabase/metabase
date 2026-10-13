import { Fragment, useCallback } from "react";
import { useAsync } from "react-use";
import { t } from "ttag";

import { PermissionsEditorLegacyNoSelfServiceWarning } from "metabase/admin/permissions/components/PermissionsEditor/PermissionsEditorLegacyWarning";
import { getPermissionsBasePath } from "metabase/common/components/PermissionsBasePath/base-path";
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
  loadDataPermissionsForDb,
  updateDataPermission,
} from "../../permissions";
import {
  type DataTreeNodeItem,
  getDataFocusSidebar,
  getGroupsDataPermissionEditor,
  getIsLoadingDatabaseTables,
  getLoadingDatabaseTablesError,
} from "../../selectors/data-permissions";
import type {
  DataPermissionValue,
  PermissionAction,
  PermissionEditorBreadcrumb,
  PermissionEditorEntity,
  PermissionSectionConfig,
  RawDataRouteParams,
} from "../../types";
import { assertNumericId, parseDataRouteParams } from "../../types";
import {
  getDatabaseFocusPermissionsUrl,
  getDatabasesBasePath,
} from "../../utils/urls";

export function DatabasesPermissionsPage() {
  const dispatch = useDispatch();
  const navigate = useNavigate();

  // These selectors resolve the focused database/schema/table from the route,
  // so they take the route params rather than reading them from the store.
  const params = useParams<RawDataRouteParams>();
  const selectorProps = { params };
  const sidebar = useSelector((state) =>
    getDataFocusSidebar(state, selectorProps),
  );
  const isSidebarLoading = useSelector((state) =>
    getIsLoadingDatabaseTables(state, selectorProps),
  );
  const sidebarError = useSelector((state) =>
    getLoadingDatabaseTablesError(state, selectorProps),
  );

  const dataRouteParams = parseDataRouteParams(params);
  const permissionEditor = useSelector((state) =>
    getGroupsDataPermissionEditor(state, { params: dataRouteParams }),
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
