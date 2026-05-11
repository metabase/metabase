import { useMemo, useState } from "react";
import type { Route } from "react-router";
import { push } from "react-router-redux";
import { t } from "ttag";
import _ from "underscore";

import { useListDatabasesQuery } from "metabase/api";
import { LeaveRouteConfirmModal } from "metabase/common/components/LeaveConfirmModal";
import { DelayedLoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import { PaneHeaderActions } from "metabase/data-studio/common/components/PaneHeader";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { useDispatch } from "metabase/redux";
import * as Urls from "metabase/urls";
import { useCreateWorkspaceMutation } from "metabase-enterprise/api";
import type { Database } from "metabase-types/api";

import type {
  WorkspaceDatabaseInfo,
  WorkspaceInfo,
} from "../../components/WorkspaceEditor";
import { WorkspaceEditor } from "../../components/WorkspaceEditor";

import { createRequest } from "./utils";

type NewWorkspacePageProps = {
  route: Route;
};

export function NewWorkspacePage({ route }: NewWorkspacePageProps) {
  const { data: databasesResponse, isLoading, error } = useListDatabasesQuery();

  if (isLoading || error != null || databasesResponse == null) {
    return <DelayedLoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  return (
    <NewWorkspacePageBody
      availableDatabases={databasesResponse.data}
      route={route}
    />
  );
}

type NewWorkspacePageBodyProps = {
  availableDatabases: Database[];
  route: Route;
};

function NewWorkspacePageBody({
  availableDatabases,
  route,
}: NewWorkspacePageBodyProps) {
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

  const handleNameChange = (newName: string) => {
    const newWorkspace: WorkspaceInfo = { ...workspace, name: newName };
    setWorkspace(newWorkspace);
  };

  const handleDatabasesChange = (newDatabases: WorkspaceDatabaseInfo[]) => {
    const newWorkspace: WorkspaceInfo = {
      ...workspace,
      databases: newDatabases,
    };
    setWorkspace(newWorkspace);
  };

  const handleSave = async () => {
    const { data: newWorkspace, error } = await createWorkspace(
      createRequest(workspace),
    );

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
        availableDatabases={availableDatabases}
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
    id: undefined,
    name: t`New workspace`,
    databases: [{ database_id: undefined, input: [] }],
  };
}
