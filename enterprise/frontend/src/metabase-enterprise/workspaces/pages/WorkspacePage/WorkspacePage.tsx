import { t } from "ttag";

import { DelayedLoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import { PageContainer } from "metabase/data-studio/common/components/PageContainer";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { Center, Stack } from "metabase/ui";
import * as Urls from "metabase/utils/urls";
import {
  useListWorkspacesQuery,
  useUpdateWorkspaceMutation,
} from "metabase-enterprise/api";
import type { Workspace } from "metabase-types/api";

import { DatabaseSection } from "../../components/DatabaseSection";
import { SetupSection } from "../../components/SetupSection";
import { WorkspaceHeader } from "../../components/WorkspaceHeader";
import { WorkspaceMoreMenu } from "../../components/WorkspaceMoreMenu";

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
  const [updateWorkspace] = useUpdateWorkspaceMutation();
  const { sendErrorToast } = useMetadataToasts();

  const handleNameChange = async (name: string) => {
    if (name === workspace.name) {
      return;
    }
    const { error } = await updateWorkspace({ id: workspace.id, name });
    if (error) {
      sendErrorToast(t`Failed to update workspace name`);
    }
  };

  return (
    <PageContainer data-testid="workspace-page" gap="2.5rem">
      <WorkspaceHeader
        workspace={workspace}
        menu={<WorkspaceMoreMenu workspace={workspace} />}
        onNameChange={handleNameChange}
      />
      <Stack gap="3.25rem">
        <DatabaseSection workspace={workspace} />
        <SetupSection workspace={workspace} />
      </Stack>
    </PageContainer>
  );
}
