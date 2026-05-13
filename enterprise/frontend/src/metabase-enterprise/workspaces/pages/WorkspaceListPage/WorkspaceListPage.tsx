import { t } from "ttag";

import { useListDatabasesQuery } from "metabase/api";
import { DelayedLoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import { DataStudioBreadcrumbs } from "metabase/data-studio/common/components/DataStudioBreadcrumbs";
import { PageContainer } from "metabase/data-studio/common/components/PageContainer";
import { PaneHeader } from "metabase/data-studio/common/components/PaneHeader";
import { Group, Stack } from "metabase/ui";
import { useListWorkspacesQuery } from "metabase-enterprise/api";
import type { Database, Workspace } from "metabase-types/api";

import { WorkspaceHelpMenu } from "../../components/WorkspaceHelpMenu";
import { getAvailableDatabases } from "../../utils";

import { NewWorkspaceButton } from "./NewWorkspaceButton";
import { WorkspaceEmptyState } from "./WorkspaceEmptyState";
import { WorkspaceSection } from "./WorkspaceSection";

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
      availableDatabases={getAvailableDatabases(databasesResponse.data)}
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
    <PageContainer data-testid="workspace-list">
      <PaneHeader
        breadcrumbs={
          <DataStudioBreadcrumbs>{t`Workspaces`}</DataStudioBreadcrumbs>
        }
        actions={
          <Group gap="sm">
            <NewWorkspaceButton
              variant={hasWorkspaces ? "default" : "filled"}
            />
            {hasWorkspaces && <WorkspaceHelpMenu />}
          </Group>
        }
        py={0}
      />
      {hasWorkspaces ? (
        <Stack gap="lg">
          {workspaces.map((workspace) => (
            <WorkspaceSection
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
