import { useState } from "react";
import type { Route } from "react-router";
import { push } from "react-router-redux";
import { t } from "ttag";
import _ from "underscore";

import { LeaveRouteConfirmModal } from "metabase/common/components/LeaveConfirmModal";
import { PaneHeaderActions } from "metabase/data-studio/common/components/PaneHeader";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { useDispatch } from "metabase/utils/redux";
import * as Urls from "metabase/utils/urls";
import { useCreateWorkspaceMutation } from "metabase-enterprise/api";
import type {
  WorkspaceDatabase,
  WorkspaceDatabaseDraft,
} from "metabase-types/api";

import { WorkspaceEditor } from "../../components/WorkspaceEditor";
import type { WorkspaceInfo } from "../../types";

import {
  getInitialWorkspace,
  getSaveErrorMessage,
  isValidWorkspace,
} from "./utils";

type NewWorkspacePageProps = {
  route: Route;
};

export function NewWorkspacePage({ route }: NewWorkspacePageProps) {
  const [createWorkspace, { isLoading: isSaving }] =
    useCreateWorkspaceMutation();
  const dispatch = useDispatch();
  const { sendSuccessToast, sendErrorToast } = useMetadataToasts();

  const initialWorkspace = getInitialWorkspace();
  const [workspace, setWorkspace] = useState<WorkspaceInfo>(initialWorkspace);
  const isValid = isValidWorkspace(workspace);
  const isDirty = !_.isEqual(workspace, initialWorkspace);

  const handleNameChange = (name: string) => {
    setWorkspace({ ...workspace, name });
  };

  const handleDatabasesChange = (databases: WorkspaceDatabaseDraft[]) => {
    setWorkspace({ ...workspace, databases: databases as WorkspaceDatabase[] });
  };

  const handleCancel = () => {
    dispatch(push(Urls.workspaceList()));
  };

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
    <>
      <WorkspaceEditor
        workspace={workspace}
        actions={
          <PaneHeaderActions
            isValid={isValid}
            isSaving={isSaving}
            isDirty
            errorMessage={getSaveErrorMessage(workspace)}
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
