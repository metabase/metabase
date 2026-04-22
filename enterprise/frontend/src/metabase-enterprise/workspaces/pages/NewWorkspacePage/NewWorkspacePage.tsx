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

import { getInitialWorkspace, isValidWorkspace } from "./utils";

type NewWorkspacePageProps = {
  route: Route;
};

export function NewWorkspacePage({ route }: NewWorkspacePageProps) {
  const [createWorkspace, { isLoading: isSaving }] =
    useCreateWorkspaceMutation();
  const dispatch = useDispatch();
  const { sendSuccessToast, sendErrorToast } = useMetadataToasts();

  const initialWorkspace = getInitialWorkspace();
  const [workspace, setWorkspace] = useState(initialWorkspace);
  const isValid = isValidWorkspace(workspace);
  const isDirty = !_.isEqual(workspace, initialWorkspace);

  const handleNameChange = (newName: string) => {
    setWorkspace({ ...workspace, name: newName });
  };

  const handleMappingsChange = (newMappings: WorkspaceDatabaseDraft[]) => {
    setWorkspace({ ...workspace, databases: newMappings });
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
      <PageContainer data-testid="new-workspace-page" gap="2.5rem">
        <NewWorkspacePageHeader
          name={workspace.name}
          isValid={isValid}
          isSaving={isSaving}
          onNameChange={handleNameChange}
          onSave={handleSave}
          onCancel={handleCancel}
        />
        <NewWorkspacePageBody
          mappings={workspace.databases}
          onMappingsChange={handleMappingsChange}
        />
      </PageContainer>
      <LeaveRouteConfirmModal route={route} isEnabled={isDirty && !isSaving} />
    </>
  );
}

type NewWorkspacePageHeaderProps = {
  name: string;
  isValid: boolean;
  isSaving: boolean;
  onNameChange: (newName: string) => void;
  onSave: () => void;
  onCancel: () => void;
};

function NewWorkspacePageHeader({
  name,
  isValid,
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
          isValid={isValid}
          isSaving={isSaving}
          isDirty
          onSave={onSave}
          onCancel={onCancel}
        />
      }
    />
  );
}

type NewWorkspacePageBodyProps = {
  mappings: WorkspaceDatabaseDraft[];
  onMappingsChange: (newMappings: WorkspaceDatabaseDraft[]) => void;
};

function NewWorkspacePageBody({
  mappings,
  onMappingsChange,
}: NewWorkspacePageBodyProps) {
  return (
    <Stack gap="3.5rem">
      <DatabaseMappingSection mappings={mappings} onChange={onMappingsChange} />
    </Stack>
  );
}
