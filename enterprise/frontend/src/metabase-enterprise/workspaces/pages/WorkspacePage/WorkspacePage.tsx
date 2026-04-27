import { t } from "ttag";

import { SettingsPageWrapper } from "metabase/admin/components/SettingsSection";
import { DelayedLoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import { useMetadataToasts } from "metabase/metadata/hooks";
import * as Urls from "metabase/utils/urls";
import { useUpdateWorkspaceMutation } from "metabase-enterprise/api";
import type {
  UpdateWorkspaceRequest,
  Workspace,
  WorkspaceDatabase,
} from "metabase-types/api";

import { WorkspaceEditor } from "../../components/WorkspaceEditor";
import { useGetWorkspaceQueryWithPolling } from "../../hooks/use-get-workspace-query-with-polling";

type WorkspacePageProps = {
  params: { workspaceId: string };
};

export function WorkspacePage({ params }: WorkspacePageProps) {
  const workspaceId = Urls.extractEntityId(params.workspaceId);
  const { workspace, isLoading, error } =
    useGetWorkspaceQueryWithPolling(workspaceId);

  if (isLoading || error != null || workspace == null) {
    return (
      <SettingsPageWrapper title={t`Workspace settings`}>
        <DelayedLoadingAndErrorWrapper loading={isLoading} error={error} />
      </SettingsPageWrapper>
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

  const handleSave = async (patch: Omit<UpdateWorkspaceRequest, "id">) => {
    const { error } = await updateWorkspace({ id: workspace.id, ...patch });
    if (error) {
      sendErrorToast(t`Failed to update workspace`);
    }
  };

  return (
    <SettingsPageWrapper title={t`Workspace settings`}>
      <WorkspaceEditor
        workspace={workspace}
        onNameChange={(name) => handleSave({ name })}
        onDatabasesChange={(databases: WorkspaceDatabase[]) =>
          handleSave({ databases })
        }
      />
    </SettingsPageWrapper>
  );
}
