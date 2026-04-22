import { useState } from "react";
import { Link, type Route } from "react-router";
import { push } from "react-router-redux";
import { t } from "ttag";
import _ from "underscore";

import { LeaveRouteConfirmModal } from "metabase/common/components/LeaveConfirmModal";
import { DataStudioBreadcrumbs } from "metabase/data-studio/common/components/DataStudioBreadcrumbs";
import { PageContainer } from "metabase/data-studio/common/components/PageContainer";
import {
  PaneHeader,
  PaneHeaderActions,
  PaneHeaderInput,
} from "metabase/data-studio/common/components/PaneHeader";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { Stack } from "metabase/ui";
import { useDispatch } from "metabase/utils/redux";
import * as Urls from "metabase/utils/urls";
import { useCreateWorkspaceMutation } from "metabase-enterprise/api";
import type { WorkspaceDatabaseDraft } from "metabase-types/api";

import { DatabaseMappingSection } from "../../components/DatabaseMappingSection";

type WorkspaceInfo = {
  name: string;
  databases: WorkspaceDatabaseDraft[];
};

type NewWorkspacePageProps = {
  route: Route;
};

export function NewWorkspacePage({ route }: NewWorkspacePageProps) {
  const [createWorkspace, { isLoading: isSaving }] =
    useCreateWorkspaceMutation();
  const dispatch = useDispatch();
  const { sendSuccessToast, sendErrorToast } = useMetadataToasts();

  const initialWorkspace = getInitialValues();
  const [workspace, setWorkspace] = useState(initialWorkspace);
  const isDirty = !_.isEqual(workspace, initialWorkspace);

  const handleNameChange = (newName: string) => {
    setWorkspace({ ...workspace, name: newName });
  };

  const handleDatabasesChange = (newDatabases: WorkspaceDatabaseDraft[]) => {
    setWorkspace({ ...workspace, databases: newDatabases });
  };

  const handleCancel = () => {
    dispatch(push(Urls.workspaceList()));
  };

  const handleSave = async () => {
    const { data, error } = await createWorkspace(workspace);
    if (error || data == null) {
      sendErrorToast(t`Failed to create workspace`);
      return;
    }

    sendSuccessToast(t`Workspace created`);
    dispatch(push(Urls.workspace(data.id)));
  };

  return (
    <>
      <PageContainer data-testid="new-workspace-page" gap="2.5rem">
        <NewWorkspacePageHeader
          name={workspace.name}
          isDirty={isDirty}
          isSaving={isSaving}
          onNameChange={handleNameChange}
          onSave={handleSave}
          onCancel={handleCancel}
        />
        <NewWorkspacePageBody
          databases={workspace.databases}
          onDatabasesChange={handleDatabasesChange}
        />
      </PageContainer>
      <LeaveRouteConfirmModal route={route} isEnabled={isDirty && !isSaving} />
    </>
  );
}

function getInitialValues(): WorkspaceInfo {
  return {
    name: t`New workspace`,
    databases: [],
  };
}

type NewWorkspacePageHeaderProps = {
  name: string;
  isDirty: boolean;
  isSaving: boolean;
  onNameChange: (newName: string) => void;
  onSave: () => void;
  onCancel: () => void;
};

function NewWorkspacePageHeader({
  name,
  isDirty,
  isSaving,
  onNameChange,
  onSave,
  onCancel,
}: NewWorkspacePageHeaderProps) {
  return (
    <PaneHeader
      py={0}
      breadcrumbs={
        <DataStudioBreadcrumbs>
          <Link key="workspace-list" to={Urls.workspaceList()}>
            {t`Workspaces`}
          </Link>
          {t`New workspace`}
        </DataStudioBreadcrumbs>
      }
      title={
        <PaneHeaderInput
          initialValue={name}
          placeholder={t`New workspace`}
          onChange={onNameChange}
        />
      }
      actions={
        <PaneHeaderActions
          isDirty={isDirty}
          isSaving={isSaving}
          onSave={onSave}
          onCancel={onCancel}
        />
      }
    />
  );
}

type NewWorkspacePageBodyProps = {
  databases: WorkspaceDatabaseDraft[];
  onDatabasesChange: (newDatabases: WorkspaceDatabaseDraft[]) => void;
};

function NewWorkspacePageBody({
  databases,
  onDatabasesChange,
}: NewWorkspacePageBodyProps) {
  return (
    <Stack gap="3.5rem">
      <DatabaseMappingSection
        databases={databases}
        onChange={onDatabasesChange}
      />
    </Stack>
  );
}
