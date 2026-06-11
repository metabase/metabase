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
import type {
  Database,
  Workspace,
  WorkspaceInstance,
} from "metabase-types/api";

import { InstanceSection } from "./InstanceSection";
import { WorkspaceSection } from "./WorkspaceSection";

export function WorkspaceListPage() {
  const {
    data: workspaces,
    isLoading: isLoadingWorkspaces,
    error: workspacesError,
  } = useListWorkspacesQuery();
  const {
    data: instances,
    isLoading: isLoadingInstances,
    error: instancesError,
  } = useListWorkspaceInstancesQuery();
  const {
    data: databasesResponse,
    isLoading: isLoadingDatabases,
    error: databasesError,
  } = useListDatabasesQuery();

  const isLoading =
    isLoadingWorkspaces || isLoadingInstances || isLoadingDatabases;
  const error = workspacesError ?? instancesError ?? databasesError;

  if (
    isLoading ||
    error != null ||
    workspaces == null ||
    instances == null ||
    databasesResponse == null
  ) {
    return <DelayedLoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  return (
    <WorkspaceListPageBody
      workspaces={workspaces}
      instances={instances}
      databases={databasesResponse.data}
    />
  );
}

type WorkspaceListPageBodyProps = {
  workspaces: Workspace[];
  instances: WorkspaceInstance[];
  databases: Database[];
};

function WorkspaceListPageBody({
  workspaces,
  instances,
  databases,
}: WorkspaceListPageBodyProps) {
  return (
    <PageContainer data-testid="workspace-list-page">
      <PaneHeader
        breadcrumbs={
          <DataStudioBreadcrumbs>{t`Workspaces`}</DataStudioBreadcrumbs>
        }
        py={0}
      />
      <Stack gap="3.5rem">
        <WorkspaceSection workspaces={workspaces} databases={databases} />
        <InstanceSection instances={instances} />
      </Stack>
    </PageContainer>
  );
}
