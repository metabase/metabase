import { DelayedLoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import { PageContainer } from "metabase/data-studio/common/components/PageContainer";
import { Center, Stack } from "metabase/ui";
import * as Urls from "metabase/utils/urls";
import { useListWorkspacesQuery } from "metabase-enterprise/api";
import type { Workspace } from "metabase-types/api";

import { DatabaseSection } from "./DatabaseSection";
import { SetupSection } from "./SetupSection";
import { WorkspaceHeader } from "./WorkspaceHeader";
import { WorkspaceMoreMenu } from "./WorkspaceMoreMenu";

type WorkspacePageProps = {
  params: { workspaceId: string };
};

export function WorkspacePage({ params }: WorkspacePageProps) {
  const workspaceId = Urls.extractEntityId(params.workspaceId);
  const { data: workspaces, isLoading, error } = useListWorkspacesQuery();
  const workspace = workspaces?.find((ws) => ws.id === workspaceId);

  if (isLoading || error != null || workspace == null) {
    return (
      <Center h="100%">
        <DelayedLoadingAndErrorWrapper loading={isLoading} error={error} />
      </Center>
    );
  }

  return <WorkspacePageBody workspace={workspace} />;
}

type WorkspacePageBodyProps = {
  workspace: Workspace;
};

function WorkspacePageBody({ workspace }: WorkspacePageBodyProps) {
  return (
    <PageContainer data-testid="workspace-page" gap="2.5rem">
      <WorkspaceHeader
        workspace={workspace}
        menu={<WorkspaceMoreMenu workspace={workspace} />}
      />
      <Stack gap="3.25rem">
        <DatabaseSection workspace={workspace} />
        <SetupSection workspace={workspace} />
      </Stack>
    </PageContainer>
  );
}
