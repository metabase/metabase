import { skipToken, useListDatabasesQuery } from "metabase/api";
import { DelayedLoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import { PageContainer } from "metabase/data-studio/common/components/PageContainer";
import { Center, Stack } from "metabase/ui";
import * as Urls from "metabase/utils/urls";
import { useGetWorkspaceQuery } from "metabase-enterprise/api";
import type { Database, Workspace } from "metabase-types/api";

import { ApiKeySection } from "./ApiKeySection";
import { DatabaseSection } from "./DatabaseSection";
import { SetupSection } from "./SetupSection";
import { WorkspaceHeader } from "./WorkspaceHeader";
import { WorkspaceMoreMenu } from "./WorkspaceMoreMenu";

type WorkspacePageProps = {
  params: { workspaceId: string };
};

export function WorkspacePage({ params }: WorkspacePageProps) {
  const workspaceId = Urls.extractEntityId(params.workspaceId);
  const {
    data: workspace,
    isLoading: isLoadingWorkspace,
    error: workspaceError,
  } = useGetWorkspaceQuery(workspaceId ?? skipToken);
  const {
    data: databasesResponse,
    isLoading: isLoadingDatabases,
    error: databasesError,
  } = useListDatabasesQuery();
  const databases = databasesResponse?.data;
  const isLoading = isLoadingWorkspace || isLoadingDatabases;
  const error = workspaceError ?? databasesError;

  if (isLoading || error != null || workspace == null || databases == null) {
    return (
      <Center h="100%">
        <DelayedLoadingAndErrorWrapper loading={isLoading} error={error} />
      </Center>
    );
  }

  return <WorkspacePageBody workspace={workspace} databases={databases} />;
}

type WorkspacePageBodyProps = {
  workspace: Workspace;
  databases: Database[];
};

function WorkspacePageBody({ workspace, databases }: WorkspacePageBodyProps) {
  return (
    <PageContainer data-testid="workspace-page" gap="2.5rem">
      <WorkspaceHeader
        workspace={workspace}
        menu={<WorkspaceMoreMenu workspace={workspace} />}
      />
      <Stack gap="3.25rem">
        <DatabaseSection workspace={workspace} databases={databases} />
        <ApiKeySection workspace={workspace} />
        <SetupSection workspace={workspace} />
      </Stack>
    </PageContainer>
  );
}
