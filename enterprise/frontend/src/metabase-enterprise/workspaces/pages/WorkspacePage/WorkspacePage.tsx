import { useListDatabasesQuery } from "metabase/api";
import { DelayedLoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import { PageContainer } from "metabase/data-studio/common/components/PageContainer";
import { Stack } from "metabase/ui";
import * as Urls from "metabase/urls";
import { useGetWorkspaceQuery } from "metabase-enterprise/api";
import type { Database, Workspace, WorkspaceId } from "metabase-types/api";

import { WorkspaceHelpMenu } from "../../components/WorkspaceHelpMenu";

import { SetupSection } from "./SetupSection";
import { WorkspaceDatabaseList } from "./WorkspaceDatabaseList";
import { WorkspaceHeader } from "./WorkspaceHeader";

type WorkspacePageParams = {
  workspaceId: string;
};

type WorkspacePageProps = {
  params: WorkspacePageParams;
};

export function WorkspacePage({ params }: WorkspacePageProps) {
  const workspaceId = Urls.extractEntityId(params.workspaceId);

  const {
    data: workspace,
    isLoading: isLoadingWorkspace,
    error: workspaceError,
  } = useGetWorkspaceQuery(workspaceId as WorkspaceId, {
    skip: workspaceId == null,
  });

  const {
    data: databasesResponse,
    isLoading: isLoadingDatabases,
    error: databasesError,
  } = useListDatabasesQuery();

  const isLoading = isLoadingWorkspace || isLoadingDatabases;
  const error = workspaceError ?? databasesError;

  if (
    isLoading ||
    error != null ||
    workspace == null ||
    databasesResponse == null
  ) {
    return <DelayedLoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  return (
    <WorkspacePageBody
      workspace={workspace}
      availableDatabases={databasesResponse.data}
    />
  );
}

type WorkspacePageBodyProps = {
  workspace: Workspace;
  availableDatabases: Database[];
};

function WorkspacePageBody({
  workspace,
  availableDatabases,
}: WorkspacePageBodyProps) {
  return (
    <PageContainer data-testid="workspace-editor">
      <WorkspaceHeader workspace={workspace} actions={<WorkspaceHelpMenu />} />
      <Stack gap="3.5rem">
        <WorkspaceDatabaseList
          workspace={workspace}
          availableDatabases={availableDatabases}
        />
        <SetupSection workspace={workspace} />
      </Stack>
    </PageContainer>
  );
}
