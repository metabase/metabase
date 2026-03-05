import { Fragment, type ReactNode, useCallback } from "react";
import { push } from "react-router-redux";
import { useAsync } from "react-use";
import { t } from "ttag";
import _ from "underscore";

import { PermissionsEditorLegacyNoSelfServiceWarning } from "metabase/admin/permissions/components/PermissionsEditor/PermissionsEditorLegacyWarning";
import { connect, useDispatch, useSelector } from "metabase/lib/redux";
import { PLUGIN_ADVANCED_PERMISSIONS } from "metabase/plugins";
import { getSetting } from "metabase/selectors/settings";
import { Center, Loader } from "metabase/ui";
import type { State } from "metabase-types/store";

import {
  PermissionsEditor,
  PermissionsEditorEmptyState,
} from "../../components/PermissionsEditor";
import { PermissionsEditorSplitPermsMessage } from "../../components/PermissionsEditor/PermissionsEditorSplitPermsMessage";
import { PermissionsSidebar } from "../../components/PermissionsSidebar";
import {
  type UpdateDataPermissionParams,
  loadDataPermissionsForDb,
  updateDataPermission,
} from "../../permissions";
import {
  type DataSidebarProps,
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

const mapDispatchToProps = {
  updateDataPermission,
  switchView: (entityType: string) =>
    push(`/admin/permissions/data/${entityType}`),
  navigateToDatabaseList: () => push(DATABASES_BASE_PATH),
  navigateToItem: (item: DataTreeNodeItem) =>
    push(getDatabaseFocusPermissionsUrl(item.entityId)),
};

const mapStateToProps = (
  state: State,
  props: { params: RawDataRouteParams },
) => {
  return {
    sidebar: getDataFocusSidebar(state, props),
    isSidebarLoading: getIsLoadingDatabaseTables(state, props),
    sidebarError: getLoadingDatabaseTablesError(state, props),
  };
};

interface DatabasesPermissionsPageInnerProps {
  sidebar: DataSidebarProps | null;
  params: RawDataRouteParams;
  children: ReactNode;
  navigateToItem: (item: any) => void;
  navigateToDatabaseList: () => void;
  switchView: (entityType: string) => void;
  updateDataPermission: (params: UpdateDataPermissionParams) => void;
  isSidebarLoading: boolean | undefined;
  sidebarError: string | undefined;
}

function DatabasesPermissionsPageInner({
  sidebar,
  params,
  children,
  navigateToItem,
  navigateToDatabaseList,
  switchView,
  updateDataPermission,
  isSidebarLoading,
  sidebarError,
}: DatabasesPermissionsPageInnerProps) {
  const dataRouteParams = parseDataRouteParams(params);
  const dispatch = useDispatch();
  const permissionEditor = useSelector((state) =>
    getGroupsDataPermissionEditor(state, { params: dataRouteParams }),
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
      switchView(entityType);
    },
    [switchView],
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

      {children}
    </Fragment>
  );
}

export const DatabasesPermissionsPage = _.compose(
  connect(mapStateToProps, mapDispatchToProps),
)(DatabasesPermissionsPageInner);
