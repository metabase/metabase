import { skipToken } from "metabase/api";
import { DelayedLoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import { PageContainer } from "metabase/data-studio/common/components/PageContainer";
import { Center, Stack } from "metabase/ui";
import * as Urls from "metabase/urls";
import { useGetWorkspaceQuery } from "metabase-enterprise/api";
import type { Workspace } from "metabase-types/api";

import { WorkspaceHeader } from "../WorkspaceSetupPage/WorkspaceHeader";

import { AccessKeyLogSection } from "./AccessKeyLogSection";
import { AccessKeySection } from "./AccessKeySection";

type WorkspaceAccessKeysPageProps = {
  params: { workspaceId: string };
};

export function WorkspaceAccessKeysPage({
  params,
}: WorkspaceAccessKeysPageProps) {
  const workspaceId = Urls.extractEntityId(params.workspaceId);

  const {
    data: workspace,
    isLoading: isLoadingWorkspace,
    error: workspaceError,
  } = useGetWorkspaceQuery(workspaceId ?? skipToken);

  if (isLoadingWorkspace || workspaceError != null || workspace == null) {
    return (
      <Center h="100%">
        <DelayedLoadingAndErrorWrapper
          loading={isLoadingWorkspace}
          error={workspaceError}
        />
      </Center>
    );
  }

  return <WorkspaceAccessKeysPageBody workspace={workspace} />;
}

type WorkspaceAccessKeysPageBodyProps = {
  workspace: Workspace;
};

function WorkspaceAccessKeysPageBody({
  workspace,
}: WorkspaceAccessKeysPageBodyProps) {
  return (
    <PageContainer data-testid="workspace-access-keys-page" gap="2.5rem">
      <WorkspaceHeader workspace={workspace} />
      <Stack gap="3.25rem">
        <AccessKeySection workspace={workspace} />
        <AccessKeyLogSection workspaceId={workspace.id} />
      </Stack>
    </PageContainer>
  );
}
