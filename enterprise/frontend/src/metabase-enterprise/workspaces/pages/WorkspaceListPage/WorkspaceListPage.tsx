import { t } from "ttag";

import { useListDatabasesQuery } from "metabase/api";
import { DelayedLoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import { DataStudioBreadcrumbs } from "metabase/data-studio/common/components/DataStudioBreadcrumbs";
import { PageContainer } from "metabase/data-studio/common/components/PageContainer";
import { PaneHeader } from "metabase/data-studio/common/components/PaneHeader";
import { Stack } from "metabase/ui";
import {
  useListWorkspaceInstancesQuery,
  useListWorkspacesQuery,
} from "metabase-enterprise/api";
import type { Database, Workspace } from "metabase-types/api";
import type { WorkspaceInstance } from "metabase-types/api/workspace";

import { WorkspaceInstanceSection } from "./WorkspaceInstanceSection";
import { WorkspaceSection } from "./WorkspaceSection";

export function WorkspaceListPage() {
  const {
    data: workspaces,
    isLoading: isLoadingWorkspaces,
    error: workspacesError,
  } = useListWorkspacesQuery();
  const {
    data: workspaceInstances,
    isLoading: isLoadingWorkspaceInstances,
    error: workspaceInstancesError,
  } = useListWorkspaceInstancesQuery();
  const {
    data: databasesResponse,
    isLoading: isLoadingDatabases,
    error: databasesError,
  } = useListDatabasesQuery();

  const isLoading =
    isLoadingWorkspaces || isLoadingWorkspaceInstances || isLoadingDatabases;
  const error = workspacesError ?? workspaceInstancesError ?? databasesError;

  if (
    isLoading ||
    error != null ||
    workspaces == null ||
    workspaceInstances == null ||
    databasesResponse == null
  ) {
    return <DelayedLoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  return (
    <WorkspaceListPageBody
      workspaces={workspaces}
      workspaceInstances={workspaceInstances}
      availableDatabases={databasesResponse.data}
    />
  );
}

type WorkspaceListPageBodyProps = {
  workspaces: Workspace[];
  workspaceInstances: WorkspaceInstance[];
  availableDatabases: Database[];
};

function WorkspaceListPageBody({
  workspaces,
  workspaceInstances,
}: WorkspaceListPageBodyProps) {
  return (
    <PageContainer data-testid="workspace-list-page">
      <PaneHeader
        breadcrumbs={
          <DataStudioBreadcrumbs>{t`Workspaces`}</DataStudioBreadcrumbs>
        }
        py={0}
      />
      <Stack gap="lg">
        <WorkspaceSection workspaces={workspaces} />
        <WorkspaceInstanceSection workspaceInstances={workspaceInstances} />
      </Stack>
    </PageContainer>
  );
}
