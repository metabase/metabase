import { t } from "ttag";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { Center } from "metabase/ui";
import * as Urls from "metabase/utils/urls";
import { useUpdateWorkspaceMutation } from "metabase-enterprise/api";
import type { Workspace, WorkspaceDatabaseDraft } from "metabase-types/api";

import { WorkspaceEditor } from "../../components/WorkspaceEditor";
import { WorkspaceMoreMenu } from "../../components/WorkspaceMoreMenu";
import { useFetchWorkspace } from "../../hooks/use-fetch-workspace";

type WorkspacePageParams = {
  workspaceId: string;
};

type WorkspacePageProps = {
  params: WorkspacePageParams;
};

export function WorkspacePage({ params }: WorkspacePageProps) {
  const workspaceId = Urls.extractEntityId(params.workspaceId);
  const { workspace, isLoading, error } = useFetchWorkspace(workspaceId);

  if (isLoading || error != null || workspace == null) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
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
  const { sendSuccessToast, sendErrorToast } = useMetadataToasts();

  const handleNameChange = async (name: string) => {
    if (name === workspace.name) {
      return;
    }
    const { error } = await updateWorkspace({
      id: workspace.id,
      name,
      databases: workspace.databases,
    });
    if (error) {
      sendErrorToast(t`Failed to update workspace name`);
    } else {
      sendSuccessToast(t`Workspace name updated`);
    }
  };

  const handleDatabasesChange = async (databases: WorkspaceDatabaseDraft[]) => {
    const { error } = await updateWorkspace({
      id: workspace.id,
      name: workspace.name,
      databases,
    });
    if (error) {
      sendErrorToast(t`Failed to update workspace`);
    } else {
      sendSuccessToast(t`Workspace updated`);
    }
  };

  return (
    <WorkspaceEditor
      workspace={workspace}
      menu={<WorkspaceMoreMenu workspace={workspace} />}
      onNameChange={handleNameChange}
      onDatabasesChange={handleDatabasesChange}
    />
  );
}
