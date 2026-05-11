import { useMemo, useState } from "react";
import type { Route } from "react-router";
import { t } from "ttag";
import _ from "underscore";

import { useListDatabasesQuery } from "metabase/api";
import { LeaveRouteConfirmModal } from "metabase/common/components/LeaveConfirmModal";
import { DelayedLoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import { PageContainer } from "metabase/data-studio/common/components/PageContainer";
import { PaneHeaderActions } from "metabase/data-studio/common/components/PaneHeader";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { Stack } from "metabase/ui";
import * as Urls from "metabase/urls";
import {
  useGetWorkspaceQuery,
  useUpdateWorkspaceMutation,
} from "metabase-enterprise/api";
import type { Database, Workspace, WorkspaceId } from "metabase-types/api";

import { DatabaseEditor } from "../../components/DatabaseEditor";
import { WorkspaceHeader } from "../../components/WorkspaceHeader";
import type { WorkspaceDatabaseInfo } from "../../types";
import { getValidWorkspaceDatabases } from "../../utils";

import { SetupSection } from "./SetupSection";

type WorkspacePageParams = {
  workspaceId: string;
};

type WorkspacePageProps = {
  params: WorkspacePageParams;
  route: Route;
};

export function WorkspacePage({ params, route }: WorkspacePageProps) {
  const workspaceId = Urls.extractEntityId(params.workspaceId);

  const {
    data: workspace,
    isLoading: isLoadingWorkspace,
    error: workspaceError,
  } = useGetWorkspaceQuery(workspaceId as WorkspaceId, {
    skip: workspaceId == null,
  });

  const {
    data: databasesResponse,
    isLoading: isLoadingDatabases,
    error: databasesError,
  } = useListDatabasesQuery();

  const isLoading = isLoadingWorkspace || isLoadingDatabases;
  const error = workspaceError ?? databasesError;

  if (
    isLoading ||
    error != null ||
    workspace == null ||
    databasesResponse == null
  ) {
    return <DelayedLoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  return (
    <WorkspacePageBody
      workspace={workspace}
      availableDatabases={databasesResponse.data}
      route={route}
    />
  );
}

type WorkspacePageBodyProps = {
  workspace: Workspace;
  availableDatabases: Database[];
  route: Route;
};

function WorkspacePageBody({
  workspace,
  availableDatabases,
  route,
}: WorkspacePageBodyProps) {
  const [workspaceDatabases, setWorkspaceDatabases] = useState<
    WorkspaceDatabaseInfo[]
  >(workspace.databases);
  const isDirty = useMemo(
    () => !_.isEqual(workspaceDatabases, workspace.databases),
    [workspaceDatabases, workspace.databases],
  );
  const [updateWorkspace, { isLoading: isSaving }] =
    useUpdateWorkspaceMutation();
  const { sendSuccessToast, sendErrorToast } = useMetadataToasts();

  const handleNameChange = async (newName: string) => {
    const { error } = await updateWorkspace({
      id: workspace.id,
      name: newName,
    });
    if (error) {
      sendErrorToast(t`Failed to update workspace name`);
    } else {
      sendSuccessToast(t`Workspace name updated`);
    }
  };

  const handleSave = async () => {
    const { error } = await updateWorkspace({
      id: workspace.id,
      databases: getValidWorkspaceDatabases(workspaceDatabases),
    });
    if (error) {
      sendErrorToast(t`Failed to update workspace`);
    } else {
      sendSuccessToast(t`Workspace updated`);
    }
  };

  const handleCancel = () => {
    setWorkspaceDatabases(workspace.databases);
  };

  return (
    <>
      <PageContainer data-testid="workspace-editor">
        <WorkspaceHeader
          name={workspace.name}
          onChangeName={handleNameChange}
          actions={
            <PaneHeaderActions
              isDirty={isDirty}
              isSaving={isSaving}
              onSave={handleSave}
              onCancel={handleCancel}
            />
          }
        />
        <Stack gap="3.5rem">
          <SetupSection workspace={workspace} />
          <DatabaseEditor
            workspaceDatabases={workspaceDatabases}
            availableDatabases={availableDatabases}
            onDatabasesChange={setWorkspaceDatabases}
          />
        </Stack>
      </PageContainer>
      <LeaveRouteConfirmModal route={route} isEnabled={isDirty && !isSaving} />
    </>
  );
}
