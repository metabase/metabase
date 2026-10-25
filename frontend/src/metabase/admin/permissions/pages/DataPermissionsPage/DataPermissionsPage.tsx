import { useMemo } from "react";

import { useListPermissionsGroupsQuery } from "metabase/api";
import { isAdminGroup, isDefaultGroup } from "metabase/common/utils/groups";
import {
  DataPermissionsHelp,
  DataPermissionsProvider,
  getDataPermissionsDiff,
  useDataPermissions,
  useGroupDataPermissionsGraph,
  usePermissionsDatabase,
} from "metabase/permissions";
import { Outlet, useParams } from "metabase/router";
import { Center, Loader } from "metabase/ui";
import type { GroupInfo } from "metabase-types/api";

import { PermissionsPageLayout } from "../../components/PermissionsPageLayout";

const EMPTY_GROUP_LIST: GroupInfo[] = [];

export function DataPermissionsPage() {
  return (
    <DataPermissionsProvider>
      <DataPermissionsPageContent />
    </DataPermissionsProvider>
  );
}

function DataPermissionsPageContent() {
  const params = useParams<{ databaseId: string }>();
  const { data, isLoading: isLoadingGroups } = useListPermissionsGroupsQuery(
    {},
  );
  const groups = data ?? EMPTY_GROUP_LIST;
  const {
    permissions,
    originalPermissions,
    databasesWithTables,
    isDirty,
    hasRevisionChanged,
    saveError,
    savePermissions,
    resetPermissions,
    clearSaveError,
  } = useDataPermissions();

  const { isLoading: isLoadingAllUsers } = useGroupDataPermissionsGraph(
    groups.find(isDefaultGroup)?.id,
  );
  const { isLoading: isLoadingAdministrators } = useGroupDataPermissionsGraph(
    groups.find(isAdminGroup)?.id,
  );
  const { isLoading: isLoadingDatabase } = usePermissionsDatabase(
    params.databaseId != null ? Number(params.databaseId) : undefined,
  );

  const diff = useMemo(
    () =>
      permissions && originalPermissions
        ? getDataPermissionsDiff({
            groups,
            permissions,
            originalPermissions,
            databasesWithTables,
          })
        : undefined,
    [groups, permissions, originalPermissions, databasesWithTables],
  );

  const isLoading =
    isLoadingGroups ||
    isLoadingAllUsers ||
    isLoadingAdministrators ||
    isLoadingDatabase ||
    permissions == null;

  return (
    <PermissionsPageLayout
      tab="data"
      onLoad={resetPermissions}
      onSave={savePermissions}
      diff={diff}
      isDirty={isDirty}
      saveError={saveError}
      onClearSaveError={clearSaveError}
      hasRevisionChanged={isDirty && hasRevisionChanged}
      helpContent={<DataPermissionsHelp />}
      canShowSplitPermsModal={!isLoading}
    >
      {isLoading ? (
        <Center h="100%" w="100%">
          <Loader size="lg" />
        </Center>
      ) : (
        <Outlet />
      )}
    </PermissionsPageLayout>
  );
}
