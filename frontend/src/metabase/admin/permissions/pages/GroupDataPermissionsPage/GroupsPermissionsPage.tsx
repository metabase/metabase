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
import type { GroupId } from "metabase-types/api";
import type { State } from "metabase-types/store";

import {
  PermissionsEditor,
  PermissionsEditorEmptyState,
} from "../../components/PermissionsEditor";
import { PermissionsEditorSplitPermsMessage } from "../../components/PermissionsEditor/PermissionsEditorSplitPermsMessage";
import { PermissionsSidebar } from "../../components/PermissionsSidebar";
import {
  type UpdateDataPermissionParams,
  loadDataPermissionsForGroup,
  updateDataPermission,
} from "../../permissions";
import {
  type DataTreeNodeItem,
  type GroupSidebarProps,
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

const mapDispatchToProps = {
  updateDataPermission,
  switchView: (entityType: string) =>
    push(`/admin/permissions/data/${entityType}/`),
  navigateToItem: (item: DataTreeNodeItem) =>
    push(`${GROUPS_BASE_PATH}/${item.id}`),
  navigateToTableItem: (
    item: PermissionEditorEntity,
    { groupId }: { groupId: GroupId },
  ) => {
    return push(getGroupFocusPermissionsUrl(groupId, item.entityId));
  },
};

const mapStateToProps = (
  state: State,
  props: { params: RawGroupRouteParams },
) => {
  return {
    sidebar: getGroupsSidebar(state, props),
    isEditorLoading: getIsLoadingDatabaseTables(state, props),
    editorError: getLoadingDatabaseTablesError(state, props),
  };
};

interface GroupsPermissionsPageInnerProps {
  sidebar: GroupSidebarProps;
  params: RawGroupRouteParams;
  children: ReactNode;
  navigateToItem: (item: any) => void;
  switchView: (entityType: string) => void;
  navigateToTableItem: (
    item: PermissionEditorEntity,
    { groupId }: { groupId: GroupId },
  ) => void;
  updateDataPermission: (params: UpdateDataPermissionParams) => void;
  isEditorLoading: boolean | undefined;
  editorError: string | undefined;
}

function GroupsPermissionsPageInner({
  sidebar,
  params,
  children,
  navigateToItem,
  switchView,
  navigateToTableItem,
  updateDataPermission,
  isEditorLoading,
  editorError,
}: GroupsPermissionsPageInnerProps) {
  const groupRouteParams = parseGroupRouteParams(params);
  const dispatch = useDispatch();

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
      switchView(entityType);
    },
    [switchView],
  );

  const handleTableItemSelect = useCallback(
    (item: PermissionEditorEntity) => {
      if (groupRouteParams.groupId == null) {
        return;
      }
      navigateToTableItem(item, { groupId: groupRouteParams.groupId });
    },
    [navigateToTableItem, groupRouteParams.groupId],
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
    [groupRouteParams.groupId, updateDataPermission],
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

      {children}
    </Fragment>
  );
}

export const GroupsPermissionsPage = _.compose(
  connect(mapStateToProps, mapDispatchToProps),
)(GroupsPermissionsPageInner);
