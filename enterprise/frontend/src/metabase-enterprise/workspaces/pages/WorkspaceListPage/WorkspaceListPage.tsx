import { t } from "ttag";

import { useListDatabasesQuery } from "metabase/api";
import { DelayedLoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import { DataStudioBreadcrumbs } from "metabase/data-studio/common/components/DataStudioBreadcrumbs";
import { PageContainer } from "metabase/data-studio/common/components/PageContainer";
import { PaneHeader } from "metabase/data-studio/common/components/PaneHeader";
import { Group, Stack } from "metabase/ui";
import {
  useGetCurrentWorkspaceQuery,
  useListWorkspacesQuery,
} from "metabase-enterprise/api";
import type {
  Database,
  Workspace,
  WorkspaceInstance,
} from "metabase-types/api";

import { HelpMenu } from "../../components/HelpMenu";
import { WorkspaceInstanceWarningState } from "../../components/WorkspaceInstanceWarningState";

import { NewWorkspaceButton } from "./NewWorkspaceButton";
import { WorkspaceItem } from "./WorkspaceItem";
import { WorkspaceListEmptyState } from "./WorkspaceListEmptyState";

export function WorkspaceListPage() {
  const {
    data: workspaces,
    isLoading: isLoadingWorkspaces,
    error: workspacesError,
  } = useListWorkspacesQuery();
  const {
    data: currentWorkspace,
    isLoading: isLoadingCurrentWorkspace,
    error: currentWorkspaceError,
  } = useGetCurrentWorkspaceQuery();
  const {
    data: databasesResponse,
    isLoading: isLoadingDatabases,
    error: databasesError,
  } = useListDatabasesQuery();

  const isLoading =
    isLoadingWorkspaces || isLoadingCurrentWorkspace || isLoadingDatabases;
  const error = workspacesError ?? currentWorkspaceError ?? databasesError;

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
      currentWorkspace={currentWorkspace ?? null}
      availableDatabases={databasesResponse.data}
    />
  );
}

type WorkspaceListPageBodyProps = {
  workspaces: Workspace[];
  currentWorkspace: WorkspaceInstance | null;
  availableDatabases: Database[];
};

function WorkspaceListPageBody({
  workspaces,
  currentWorkspace,
  availableDatabases,
}: WorkspaceListPageBodyProps) {
  const hasWorkspaces = workspaces.length > 0;
  const isWorkspaceInstance = currentWorkspace != null;
  const hasActions = hasWorkspaces && !isWorkspaceInstance;

  return (
    <PageContainer data-testid="workspace-list-page">
      <PaneHeader
        breadcrumbs={
          <DataStudioBreadcrumbs>{t`Workspaces`}</DataStudioBreadcrumbs>
        }
        actions={
          hasActions && (
            <Group gap="sm">
              <NewWorkspaceButton />
              <HelpMenu />
            </Group>
          )
        }
        py={0}
      />
      {isWorkspaceInstance ? (
        <WorkspaceInstanceWarningState />
      ) : !hasWorkspaces ? (
        <WorkspaceListEmptyState />
      ) : (
        <Stack data-testid="workspace-list" gap="lg">
          {workspaces.map((workspace) => (
            <WorkspaceItem
              key={workspace.id}
              workspace={workspace}
              availableDatabases={availableDatabases}
            />
          ))}
        </Stack>
      )}
    </PageContainer>
  );
}
