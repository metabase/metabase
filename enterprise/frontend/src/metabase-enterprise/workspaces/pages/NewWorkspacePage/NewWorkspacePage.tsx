import { useState } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import { SettingsPageWrapper } from "metabase/admin/components/SettingsSection";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { useDispatch } from "metabase/redux";
import * as Urls from "metabase/utils/urls";
import { useCreateWorkspaceMutation } from "metabase-enterprise/api";
import type { WorkspaceDatabase } from "metabase-types/api";

import { WorkspaceEditor } from "../../components/WorkspaceEditor";
import type { WorkspaceInfo } from "../../types";

const INITIAL_WORKSPACE: WorkspaceInfo = {
  name: "",
  databases: [],
};

export function NewWorkspacePage() {
  const dispatch = useDispatch();
  const [createWorkspace, { isLoading: isSaving }] =
    useCreateWorkspaceMutation();
  const { sendSuccessToast, sendErrorToast } = useMetadataToasts();

  const [workspace, setWorkspace] = useState<WorkspaceInfo>(INITIAL_WORKSPACE);
  const isValid =
    workspace.name.trim().length > 0 && workspace.databases.length > 0;

  const handleNameChange = (name: string) =>
    setWorkspace({ ...workspace, name });
  const handleDatabasesChange = (databases: WorkspaceDatabase[]) =>
    setWorkspace({ ...workspace, databases });

  const handleSave = async () => {
    const { data, error } = await createWorkspace({
      name: workspace.name,
      databases: workspace.databases,
    });
    if (error || data == null) {
      sendErrorToast(t`Failed to create workspace`);
      return;
    }
    sendSuccessToast(t`Workspace created`);
    dispatch(push(Urls.workspace(data.id)));
  };

  return (
    <SettingsPageWrapper title={t`New workspace`}>
      <WorkspaceEditor
        workspace={workspace}
        isSaving={isSaving}
        isValid={isValid}
        onNameChange={handleNameChange}
        onDatabasesChange={handleDatabasesChange}
        onSave={handleSave}
      />
    </SettingsPageWrapper>
  );
}
