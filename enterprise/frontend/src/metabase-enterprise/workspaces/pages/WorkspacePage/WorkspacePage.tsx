import { t } from "ttag";

import { DelayedLoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { Center } from "metabase/ui";
import * as Urls from "metabase/utils/urls";
import { useUpdateWorkspaceMutation } from "metabase-enterprise/api";
import type { Workspace, WorkspaceDatabase } from "metabase-types/api";

import { useFetchWorkspace } from "../../hooks/use-fetch-workspace";

import { WorkspaceEditor } from "./WorkspaceEditor";

type WorkspacePageProps = {
  params: { workspaceId: string };
};

export function WorkspacePage({ params }: WorkspacePageProps) {
  const workspaceId = Urls.extractEntityId(params.workspaceId);
  const { workspace, isLoading, error } = useFetchWorkspace(workspaceId);

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

  const handleDatabasesChange = async (databases: WorkspaceDatabase[]) => {
    const { error } = await updateWorkspace({
      id: workspace.id,
      databases,
    });
    if (error) {
      sendErrorToast(t`Failed to update workspace`);
    }
  };

  return (
    <WorkspaceEditor
      workspace={workspace}
      onNameChange={handleNameChange}
      onDatabasesChange={handleDatabasesChange}
    />
  );
}
