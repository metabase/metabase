import { useListDatabasesQuery } from "metabase/api";
import { DelayedLoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import { PageContainer } from "metabase/common/data-studio/components/PageContainer";
import { Stack } from "metabase/ui";
import { useListWorkspacesQuery } from "metabase-enterprise/api";
import type { Database, Workspace } from "metabase-types/api";

import { WorkspacesHeader } from "../../components/WorkspacesHeader";

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
      <WorkspacesHeader
        actions={hasWorkspaces && <NewWorkspaceButton databases={databases} />}
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
