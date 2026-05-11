import { useMemo, useState } from "react";
import type { Route } from "react-router";
import { push } from "react-router-redux";
import { t } from "ttag";
import _ from "underscore";

import { useListDatabasesQuery } from "metabase/api";
import { LeaveRouteConfirmModal } from "metabase/common/components/LeaveConfirmModal";
import { DelayedLoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import { PageContainer } from "metabase/data-studio/common/components/PageContainer";
import { PaneHeaderActions } from "metabase/data-studio/common/components/PaneHeader";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { useDispatch } from "metabase/redux";
import { Stack } from "metabase/ui";
import * as Urls from "metabase/urls";
import { useCreateWorkspaceMutation } from "metabase-enterprise/api";
import type { Database } from "metabase-types/api";

import { DatabaseSectionList } from "../../components/DatabaseSectionList";
import { WorkspaceHeader } from "../../components/WorkspaceHeader";
import {
  getAvailableDatabases,
  getValidWorkspaceDatabases,
  validateWorkspaceDatabases,
} from "../../utils";

import { getInitialName, getInitialWorkspaceDatabases } from "./utils";

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
      availableDatabases={getAvailableDatabases(databasesResponse.data)}
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
  const initialName = getInitialName();
  const initialDatabases = useMemo(
    () => getInitialWorkspaceDatabases(availableDatabases),
    [availableDatabases],
  );
  const [name, setName] = useState(initialName);
  const [workspaceDatabases, setWorkspaceDatabases] =
    useState(initialDatabases);
  const isDirty = useMemo(
    () =>
      name !== initialName || !_.isEqual(workspaceDatabases, initialDatabases),
    [name, workspaceDatabases, initialName, initialDatabases],
  );
  const validationResult = useMemo(
    () => validateWorkspaceDatabases(workspaceDatabases),
    [workspaceDatabases],
  );
  const [createWorkspace, { isLoading: isCreating }] =
    useCreateWorkspaceMutation();
  const { sendSuccessToast, sendErrorToast } = useMetadataToasts();
  const dispatch = useDispatch();

  const handleSave = async () => {
    const { data: newWorkspace, error } = await createWorkspace({
      name,
      databases: getValidWorkspaceDatabases(workspaceDatabases),
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
      <PageContainer data-testid="workspace-editor">
        <WorkspaceHeader
          name={name}
          isNew
          onChangeName={setName}
          actions={
            <PaneHeaderActions
              errorMessage={validationResult.errorMessage}
              isValid={validationResult.isValid}
              isDirty
              isSaving={isCreating}
              onSave={handleSave}
              onCancel={handleCancel}
            />
          }
        />
        <Stack gap="3.5rem">
          <DatabaseSectionList
            workspaceDatabases={workspaceDatabases}
            availableDatabases={availableDatabases}
            onDatabasesChange={setWorkspaceDatabases}
          />
        </Stack>
      </PageContainer>
      <LeaveRouteConfirmModal
        route={route}
        isEnabled={isDirty && !isCreating}
      />
    </>
  );
}
