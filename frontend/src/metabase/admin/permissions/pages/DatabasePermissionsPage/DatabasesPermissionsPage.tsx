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
  DATABASES_BASE_PATH,
  getDatabaseFocusPermissionsUrl,
} from "../../utils/urls";

export function DatabasesPermissionsPage() {
  const dispatch = useDispatch();

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
    dispatch(
      push(
        getDatabaseFocusPermissionsUrl(
          // The sidebar types `onSelect` with the base tree item, but every node
          // it renders here comes from `getDataFocusSidebar`, which builds
          // `DataTreeNodeItem`s carrying an `entityId`.
          (item as DataTreeNodeItem).entityId,
        ),
      ),
    );
  const navigateToDatabaseList = () => dispatch(push(DATABASES_BASE_PATH));

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
      dispatch(push(`/admin/permissions/data/${entityType}`));
    },
    [dispatch],
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
    dispatch(
      action.actionCreator(item.entityId, assertNumericId(item.id), "database"),
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
