import { Link } from "react-router";
import { t } from "ttag";

import { useListDatabasesQuery } from "metabase/api";
import { DelayedLoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import { DataStudioBreadcrumbs } from "metabase/data-studio/common/components/DataStudioBreadcrumbs";
import { PageContainer } from "metabase/data-studio/common/components/PageContainer";
import { PaneHeader } from "metabase/data-studio/common/components/PaneHeader";
import { Button, Icon, Stack } from "metabase/ui";
import * as Urls from "metabase/urls";
import { useListWorkspacesQuery } from "metabase-enterprise/api";
import type { Database, Workspace } from "metabase-types/api";

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

  return (
    <PageContainer data-testid="workspace-list" gap="2.5rem">
      <PaneHeader
        breadcrumbs={
          <DataStudioBreadcrumbs>{t`Workspaces`}</DataStudioBreadcrumbs>
        }
        actions={
          <Button
            component={Link}
            to={Urls.newWorkspace()}
            aria-label={t`Add workspace`}
            leftSection={<Icon name="add" />}
          />
        }
        py={0}
      />
      {isLoading ||
      error != null ||
      workspaces == null ||
      databasesResponse == null ? (
        <DelayedLoadingAndErrorWrapper loading={isLoading} error={error} />
      ) : (
        <WorkspaceListPageBody
          workspaces={workspaces}
          availableDatabases={databasesResponse.data}
        />
      )}
    </PageContainer>
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
  return (
    <Stack gap="lg">
      {workspaces.map((workspace) => (
        <WorkspaceSection
          key={workspace.id}
          workspace={workspace}
          availableDatabases={availableDatabases}
        />
      ))}
    </Stack>
  );
}
