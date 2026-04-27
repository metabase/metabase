import { useEffect, useState } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import { SettingsSection } from "metabase/admin/components/SettingsSection";
import { useConfirmation } from "metabase/common/hooks/use-confirmation";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { useDispatch } from "metabase/redux";
import { Button, Group, Stack, TextInput } from "metabase/ui";
import * as Urls from "metabase/utils/urls";
import { useDeleteWorkspaceMutation } from "metabase-enterprise/api";
import type { WorkspaceDatabase, WorkspaceId } from "metabase-types/api";

import type { WorkspaceInfo } from "../../types";
import { isDatabaseUnprovisioned } from "../../utils";

import { DatabaseMappingSection } from "./DatabaseMappingSection";
import { StatusSection } from "./StatusSection";

type WorkspaceEditorProps = {
  workspace: WorkspaceInfo;
  isSaving?: boolean;
  isValid?: boolean;
  onNameChange: (name: string) => void;
  onDatabasesChange: (databases: WorkspaceDatabase[]) => void;
  onSave?: () => void;
};

export function WorkspaceEditor({
  workspace,
  isSaving,
  isValid,
  onNameChange,
  onDatabasesChange,
  onSave,
}: WorkspaceEditorProps) {
  const workspaceId = workspace.id;
  const isNew = workspaceId == null;

  return (
    <Stack gap="lg">
      <InfoSection
        workspace={workspace}
        onNameChange={onNameChange}
        onDatabasesChange={onDatabasesChange}
      />
      {workspaceId != null && <StatusSection workspace={workspace} />}
      <Group justify="flex-end">
        {isNew && onSave && (
          <Button
            variant="filled"
            loading={isSaving}
            disabled={!isValid}
            onClick={onSave}
          >{t`Create workspace`}</Button>
        )}
        {workspaceId != null && (
          <DeleteButton workspace={workspace} workspaceId={workspaceId} />
        )}
      </Group>
    </Stack>
  );
}

type InfoSectionProps = {
  workspace: WorkspaceInfo;
  onNameChange: (name: string) => void;
  onDatabasesChange: (databases: WorkspaceDatabase[]) => void;
};

function InfoSection({
  workspace,
  onNameChange,
  onDatabasesChange,
}: InfoSectionProps) {
  const [name, setName] = useState(workspace.name);

  useEffect(() => {
    setName(workspace.name);
  }, [workspace.name]);

  const commitName = () => {
    if (name !== workspace.name) {
      onNameChange(name);
    }
  };

  return (
    <SettingsSection>
      <TextInput
        label={t`Name`}
        value={name}
        placeholder={t`Workspace name`}
        onChange={(event) => setName(event.currentTarget.value)}
        onBlur={commitName}
      />
      <DatabaseMappingSection
        databases={workspace.databases}
        onChange={onDatabasesChange}
      />
    </SettingsSection>
  );
}

type DeleteButtonProps = {
  workspace: WorkspaceInfo;
  workspaceId: WorkspaceId;
};

function DeleteButton({ workspace, workspaceId }: DeleteButtonProps) {
  const dispatch = useDispatch();
  const [deleteWorkspace] = useDeleteWorkspaceMutation();
  const { sendSuccessToast, sendErrorToast } = useMetadataToasts();
  const { modalContent, show } = useConfirmation();

  const isFullyUnprovisioned = workspace.databases.every(
    isDatabaseUnprovisioned,
  );

  const handleDelete = () => {
    show({
      title: t`Delete this workspace?`,
      message: t`This cannot be undone.`,
      confirmButtonText: t`Delete workspace`,
      confirmButtonProps: { variant: "filled", color: "error" },
      onConfirm: async () => {
        const { error } = await deleteWorkspace(workspaceId);
        if (error) {
          sendErrorToast(t`Failed to delete workspace`);
          return;
        }
        sendSuccessToast(t`Workspace deleted`);
        dispatch(push(Urls.workspaceList()));
      },
    });
  };

  return (
    <>
      <Button
        variant="filled"
        color="error"
        disabled={!isFullyUnprovisioned}
        onClick={handleDelete}
      >{t`Delete workspace`}</Button>
      {modalContent}
    </>
  );
}
