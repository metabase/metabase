import { useMemo, useState } from "react";
import type { Route } from "react-router";
import { push } from "react-router-redux";
import { t } from "ttag";
import _ from "underscore";

import { LeaveRouteConfirmModal } from "metabase/common/components/LeaveConfirmModal";
import { PaneHeaderActions } from "metabase/data-studio/common/components/PaneHeader";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { useDispatch } from "metabase/redux";
import * as Urls from "metabase/utils/urls";
import { useCreateWorkspaceMutation } from "metabase-enterprise/api";
import type { WorkspaceDatabase } from "metabase-types/api";

import { WorkspaceEditor } from "../../components/WorkspaceEditor";
import type { WorkspaceInfo } from "../../types";

type NewWorkspacePageProps = {
  route: Route;
};

export function NewWorkspacePage({ route }: NewWorkspacePageProps) {
  const dispatch = useDispatch();
  const [createWorkspace, { isLoading: isSaving }] =
    useCreateWorkspaceMutation();
  const { sendSuccessToast, sendErrorToast } = useMetadataToasts();
  const initialWorkspace = useMemo(() => getInitialWorkspace(), []);
  const [workspace, setWorkspace] = useState(initialWorkspace);

  const { isValid, errorMessage } = validateWorkspace(workspace);
  const isDirty = !_.isEqual(workspace, initialWorkspace);

  const handleNameChange = (name: string) => {
    setWorkspace({ ...workspace, name });
  };

  const handleDatabasesChange = (databases: WorkspaceDatabase[]) => {
    setWorkspace({ ...workspace, databases });
  };

  const handleCancel = () => {
    dispatch(push(Urls.workspaceList()));
  };

  const handleSave = async () => {
    const { data, error } = await createWorkspace({
      name: workspace.name.trim(),
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
    <>
      <WorkspaceEditor
        workspace={workspace}
        actions={
          <PaneHeaderActions
            isValid={isValid}
            isSaving={isSaving}
            isDirty
            errorMessage={errorMessage}
            onSave={handleSave}
            onCancel={handleCancel}
          />
        }
        onNameChange={handleNameChange}
        onDatabasesChange={handleDatabasesChange}
      />
      <LeaveRouteConfirmModal route={route} isEnabled={isDirty && !isSaving} />
    </>
  );
}

function getInitialWorkspace(): WorkspaceInfo {
  return {
    name: t`New workspace`,
    databases: [],
  };
}

function validateWorkspace(workspace: WorkspaceInfo) {
  if (workspace.name.trim().length === 0) {
    return { isValid: false, errorMessage: t`Workspace name is required.` };
  }
  if (workspace.databases.length === 0) {
    return {
      isValid: false,
      errorMessage: t`At least one database is required.`,
    };
  }
  return { isValid: true };
}
