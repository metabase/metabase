import { useMemo, useState } from "react";
import type { Route } from "react-router";
import { push } from "react-router-redux";
import { t } from "ttag";
import _ from "underscore";

import { LeaveRouteConfirmModal } from "metabase/common/components/LeaveConfirmModal";
import { PaneHeaderActions } from "metabase/data-studio/common/components/PaneHeader";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { useDispatch } from "metabase/redux";
import * as Urls from "metabase/urls";
import { useCreateWorkspaceMutation } from "metabase-enterprise/api";

import type {
  WorkspaceDatabaseInfo,
  WorkspaceInfo,
} from "../../components/WorkspaceEditor";
import { WorkspaceEditor } from "../../components/WorkspaceEditor";

type NewWorkspacePageProps = {
  route: Route;
};

export function NewWorkspacePage({ route }: NewWorkspacePageProps) {
  const initialWorkspace = useMemo(() => getNewWorkspaceInfo(), []);
  const [workspace, setWorkspace] = useState(initialWorkspace);
  const isDirty = useMemo(
    () => !_.isEqual(workspace, initialWorkspace),
    [workspace, initialWorkspace],
  );
  const [createWorkspace, { isLoading: isCreating }] =
    useCreateWorkspaceMutation();
  const { sendSuccessToast, sendErrorToast } = useMetadataToasts();
  const dispatch = useDispatch();

  const handleNameChange = (name: string) => {
    setWorkspace({ ...workspace, name });
  };

  const handleDatabasesChange = (databases: WorkspaceDatabaseInfo[]) => {
    setWorkspace({ ...workspace, databases });
  };

  const handleSave = async () => {
    const { data: newWorkspace, error } = await createWorkspace({
      name: workspace.name,
      databases: workspace.databases.map(({ database_id, input }) => ({
        database_id,
        input,
      })),
    });

    if (error || newWorkspace == null) {
      sendErrorToast(t`Failed to create a workspace`);
    } else {
      sendSuccessToast(t`New workspace created`);
      dispatch(push(Urls.workspace(newWorkspace.id)));
    }
  };

  const handleCancel = () => {
    dispatch(push(Urls.workspaceList()));
  };

  return (
    <>
      <WorkspaceEditor
        workspace={workspace}
        actions={
          <PaneHeaderActions
            isDirty
            isSaving={isCreating}
            onSave={handleSave}
            onCancel={handleCancel}
          />
        }
        onChangeName={handleNameChange}
        onChangeDatabases={handleDatabasesChange}
      />
      <LeaveRouteConfirmModal
        route={route}
        isEnabled={isDirty && !isCreating}
      />
    </>
  );
}

function getNewWorkspaceInfo(): WorkspaceInfo {
  return {
    name: t`New workspace`,
    databases: [],
  };
}
