import { useListDatabasesQuery } from "metabase/api";
import { DelayedLoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import { PageContainer } from "metabase/data-studio/common/components/PageContainer";
import { Stack } from "metabase/ui";
import * as Urls from "metabase/urls";
import {
  useGetCurrentWorkspaceQuery,
  useGetWorkspaceQuery,
} from "metabase-enterprise/api";
import type {
  Database,
  Workspace,
  WorkspaceId,
  WorkspaceInstance,
} from "metabase-types/api";

import { HelpMenu } from "../../components/HelpMenu";
import { WorkspaceInstanceWarningState } from "../../components/WorkspaceInstanceWarningState";

import { DatabaseSection } from "./DatabaseSection";
import { SetupSection } from "./SetupSection";
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
    isLoadingWorkspace || isLoadingCurrentWorkspace || isLoadingDatabases;
  const error = workspaceError ?? currentWorkspaceError ?? databasesError;

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
      currentWorkspace={currentWorkspace ?? null}
      availableDatabases={databasesResponse.data}
    />
  );
}

type WorkspacePageBodyProps = {
  workspace: Workspace;
  currentWorkspace: WorkspaceInstance | null;
  availableDatabases: Database[];
};

function WorkspacePageBody({
  workspace,
  currentWorkspace,
  availableDatabases,
}: WorkspacePageBodyProps) {
  const isWorkspaceInstance = currentWorkspace != null;

  return (
    <PageContainer data-testid="workspace-page">
      <WorkspaceHeader
        workspace={workspace}
        actions={!isWorkspaceInstance && <HelpMenu />}
      />
      {isWorkspaceInstance ? (
        <WorkspaceInstanceWarningState />
      ) : (
        <Stack gap="3.5rem">
          <DatabaseSection
            workspace={workspace}
            availableDatabases={availableDatabases}
          />
          <SetupSection workspace={workspace} />
        </Stack>
      )}
    </PageContainer>
  );
}
