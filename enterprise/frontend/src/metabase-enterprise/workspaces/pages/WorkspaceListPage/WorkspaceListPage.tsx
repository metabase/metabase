import { t } from "ttag";

import { useListDatabasesQuery } from "metabase/api";
import { DelayedLoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import { DataStudioBreadcrumbs } from "metabase/data-studio/common/components/DataStudioBreadcrumbs";
import { PageContainer } from "metabase/data-studio/common/components/PageContainer";
import { PaneHeader } from "metabase/data-studio/common/components/PaneHeader";
import { Group, Stack } from "metabase/ui";
import { useListWorkspacesQuery } from "metabase-enterprise/api";
import type { Database, Workspace } from "metabase-types/api";

import { HelpMenu } from "../../components/HelpMenu";

import { NewWorkspaceButton } from "./NewWorkspaceButton";
import { WorkspaceEmptyState } from "./WorkspaceEmptyState";
import { WorkspaceItem } from "./WorkspaceItem";

export function WorkspaceListPage() {
  const {
    data: workspaces,
    isLoading: isLoadingWorkspaces,
    error: workspacesError,
  } = useListWorkspacesQuery();
  const {
    data: databasesResponse,
    isLoading: isLoadingDatabases,
    error: databasesError,
  } = useListDatabasesQuery();

  const isLoading = isLoadingWorkspaces || isLoadingDatabases;
  const error = workspacesError ?? databasesError;

  if (
    isLoading ||
    error != null ||
    workspaces == null ||
    databasesResponse == null
  ) {
    return <DelayedLoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  return (
    <WorkspaceListPageBody
      workspaces={workspaces}
      availableDatabases={databasesResponse.data}
    />
  );
}

type WorkspaceListPageBodyProps = {
  workspaces: Workspace[];
  availableDatabases: Database[];
};

function WorkspaceListPageBody({
  workspaces,
  availableDatabases,
}: WorkspaceListPageBodyProps) {
  const hasWorkspaces = workspaces.length > 0;

  return (
    <PageContainer data-testid="workspace-list-page">
      <PaneHeader
        breadcrumbs={
          <DataStudioBreadcrumbs>{t`Workspaces`}</DataStudioBreadcrumbs>
        }
        actions={
          hasWorkspaces && (
            <Group gap="sm">
              <NewWorkspaceButton />
              <HelpMenu />
            </Group>
          )
        }
        py={0}
      />
      {hasWorkspaces ? (
        <Stack gap="lg">
          {workspaces.map((workspace) => (
            <WorkspaceItem
              key={workspace.id}
              workspace={workspace}
              availableDatabases={availableDatabases}
            />
          ))}
        </Stack>
      ) : (
        <WorkspaceEmptyState />
      )}
    </PageContainer>
  );
}
