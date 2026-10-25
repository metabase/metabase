import { useMemo } from "react";

import { useListPermissionsGroupsQuery } from "metabase/api";
import { getErrorMessage } from "metabase/api/utils/errors";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { isAdminGroup, isDefaultGroup } from "metabase/common/utils/groups";
import {
  DataPermissionsHelp,
  DataPermissionsProvider,
  diffDataPermissions,
  parseDataRouteParams,
  useDataPermissions,
  useLoadGroupDataPermissions,
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
  const {
    data,
    isLoading: isLoadingGroups,
    error: groupsError,
  } = useListPermissionsGroupsQuery({});
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

  const allUsersGraph = useLoadGroupDataPermissions(
    groups.find(isDefaultGroup)?.id,
  );
  const administratorsGraph = useLoadGroupDataPermissions(
    groups.find(isAdminGroup)?.id,
  );

  const diff = useMemo(
    () =>
      permissions && originalPermissions
        ? diffDataPermissions(
            permissions,
            originalPermissions,
            groups,
            Object.values(databasesWithTables),
          )
        : undefined,
    [groups, permissions, originalPermissions, databasesWithTables],
  );

  const error =
    (groupsError != null ? getErrorMessage(groupsError) : undefined) ??
    allUsersGraph.error ??
    administratorsGraph.error;
  const { isLoading: isLoadingDatabase } = usePermissionsDatabase(
    parseDataRouteParams(params).databaseId,
  );
  const isLoading =
    isLoadingGroups ||
    allUsersGraph.isLoading ||
    administratorsGraph.isLoading ||
    isLoadingDatabase ||
    permissions == null;

  return (
    <PermissionsPageLayout
      tab="data"
      onCancel={resetPermissions}
      onSave={savePermissions}
      diff={diff}
      isDirty={isDirty}
      saveError={saveError}
      onClearSaveError={clearSaveError}
      hasRevisionChanged={isDirty && hasRevisionChanged}
      helpContent={<DataPermissionsHelp />}
      canShowSplitPermsModal={!isLoading}
    >
      {error != null && <LoadingAndErrorWrapper error={error} />}
      {error == null && isLoading && (
        <Center h="100%" w="100%">
          <Loader size="lg" />
        </Center>
      )}
      {error == null && !isLoading && <Outlet />}
    </PermissionsPageLayout>
  );
}
