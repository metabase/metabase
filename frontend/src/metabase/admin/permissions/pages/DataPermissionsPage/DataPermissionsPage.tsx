import { useListPermissionsGroupsQuery } from "metabase/api";
import { getErrorMessage } from "metabase/api/utils/errors";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import {
  DataPermissionsHelp,
  DataPermissionsProvider,
  getDatabasesBasePath,
  parseDataRouteParams,
  parseGroupRouteParams,
  useDataPermissions,
  usePermissionsDatabase,
} from "metabase/permissions";
import { Outlet, useLocation, useParams } from "metabase/router";
import { Center, Loader } from "metabase/ui";

import { PermissionsPageLayout } from "../../components/PermissionsPageLayout";

export function DataPermissionsPage() {
  const params = useParams<{ groupId: string; databaseId: string }>();
  const { pathname } = useLocation();
  const view = pathname.startsWith(getDatabasesBasePath())
    ? "database"
    : "group";

  return (
    <DataPermissionsProvider
      view={view}
      groupId={parseGroupRouteParams(params).groupId}
      databaseId={parseDataRouteParams(params).databaseId}
    >
      <DataPermissionsPageContent
        databaseId={parseDataRouteParams(params).databaseId}
      />
    </DataPermissionsProvider>
  );
}

type DataPermissionsPageContentProps = {
  databaseId: number | undefined;
};

function DataPermissionsPageContent({
  databaseId,
}: DataPermissionsPageContentProps) {
  const { isLoading: isLoadingGroups, error: groupsError } =
    useListPermissionsGroupsQuery({});
  const {
    diff,
    isDirty,
    isLoading: isLoadingGraphs,
    error: graphError,
    hasRevisionChanged,
    saveError,
    savePermissions,
    resetPermissions,
    clearSaveError,
  } = useDataPermissions();
  const { isLoading: isLoadingDatabase } = usePermissionsDatabase(databaseId);

  const error =
    (groupsError != null ? getErrorMessage(groupsError) : undefined) ??
    graphError;
  const isLoading = isLoadingGroups || isLoadingGraphs || isLoadingDatabase;

  return (
    <PermissionsPageLayout
      tab="data"
      onCancel={resetPermissions}
      onSave={savePermissions}
      diff={diff}
      isDirty={isDirty}
      saveError={saveError}
      onClearSaveError={clearSaveError}
      hasRevisionChanged={hasRevisionChanged}
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
