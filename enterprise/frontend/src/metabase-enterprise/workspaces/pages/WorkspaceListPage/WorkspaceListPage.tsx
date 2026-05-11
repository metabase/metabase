import { Link } from "react-router";
import { t } from "ttag";

import { useListDatabasesQuery } from "metabase/api";
import { DelayedLoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import { DataStudioBreadcrumbs } from "metabase/data-studio/common/components/DataStudioBreadcrumbs";
import { PageContainer } from "metabase/data-studio/common/components/PageContainer";
import { PaneHeader } from "metabase/data-studio/common/components/PaneHeader";
import { Button, Icon, Stack, Tooltip } from "metabase/ui";
import * as Urls from "metabase/urls";
import { useListWorkspacesQuery } from "metabase-enterprise/api";
import type { Database, Workspace } from "metabase-types/api";

import { getAvailableDatabases } from "../../utils";

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

  const availableDatabases = getAvailableDatabases(databasesResponse.data);
  const hasAvailableDatabases = availableDatabases.length > 0;

  return (
    <PageContainer data-testid="workspace-list">
      <PaneHeader
        breadcrumbs={
          <DataStudioBreadcrumbs>{t`Workspaces`}</DataStudioBreadcrumbs>
        }
        actions={
          <Tooltip
            label={t`There are no databases that support workspaces.`}
            disabled={hasAvailableDatabases}
          >
            {hasAvailableDatabases ? (
              <Button
                component={Link}
                to={Urls.newWorkspace()}
                aria-label={t`Add workspace`}
                leftSection={<Icon name="add" />}
              />
            ) : (
              <Button
                disabled
                aria-label={t`Add workspace`}
                leftSection={<Icon name="add" />}
              />
            )}
          </Tooltip>
        }
        py={0}
      />
      <WorkspaceListPageBody
        workspaces={workspaces}
        availableDatabases={availableDatabases}
      />
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
  if (workspaces.length === 0) {
    return <WorkspaceEmptyState />;
  }

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
