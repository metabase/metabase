import { t } from "ttag";

import { useListDatabasesQuery } from "metabase/api";
import { DelayedLoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import { DataStudioBreadcrumbs } from "metabase/common/data-studio/components/DataStudioBreadcrumbs";
import { PageContainer } from "metabase/common/data-studio/components/PageContainer";
import { PaneHeader } from "metabase/common/data-studio/components/PaneHeader";
import { Stack } from "metabase/ui";
import { useListWorkspacesQuery } from "metabase-enterprise/api";
import type { Database, Workspace } from "metabase-types/api";

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
      databases={databasesResponse.data}
    />
  );
}

type WorkspaceListPageBodyProps = {
  workspaces: Workspace[];
  databases: Database[];
};

function WorkspaceListPageBody({
  workspaces,
  databases,
}: WorkspaceListPageBodyProps) {
  const hasWorkspaces = workspaces.length > 0;

  return (
    <PageContainer data-testid="workspace-list-page">
      <PaneHeader
        breadcrumbs={
          <DataStudioBreadcrumbs>{t`Workspaces`}</DataStudioBreadcrumbs>
        }
        actions={hasWorkspaces && <NewWorkspaceButton databases={databases} />}
        py={0}
      />
      {hasWorkspaces ? (
        <Stack data-testid="workspace-list">
          {workspaces.map((workspace) => (
            <WorkspaceItem key={workspace.id} workspace={workspace} />
          ))}
        </Stack>
      ) : (
        <WorkspaceEmptyState databases={databases} />
      )}
    </PageContainer>
  );
}
