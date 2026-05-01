import { useDisclosure } from "@mantine/hooks";
import { useState } from "react";
import { t } from "ttag";

import { useConfirmation } from "metabase/common/hooks/use-confirmation";
import { Button } from "metabase/ui";
import { useDeleteWorkspaceAccessKeyMutation } from "metabase-enterprise/api";
import { TitleSection } from "metabase-enterprise/workspaces/common/components/TitleSection";
import type { Workspace, WorkspaceAccessKey } from "metabase-types/api";

import { CreateAccessKeyModal, EditAccessKeyModal } from "./AccessKeyModal";
import { AccessKeyTable } from "./AccessKeyTable";

type AccessKeySectionProps = {
  workspace: Workspace;
};

export function AccessKeySection({ workspace }: AccessKeySectionProps) {
  const accessKeys = workspace.access_keys ?? [];
  const [isCreateOpen, { open: openCreate, close: closeCreate }] =
    useDisclosure(false);
  const [editingKey, setEditingKey] = useState<WorkspaceAccessKey | null>(null);
  const [deleteAccessKey] = useDeleteWorkspaceAccessKeyMutation();
  const { modalContent: deleteModalContent, show: showDeleteConfirmation } =
    useConfirmation();

  const handleEditOpen = (accessKey: WorkspaceAccessKey) =>
    setEditingKey(accessKey);
  const handleEditClose = () => setEditingKey(null);

  const handleDelete = (accessKey: WorkspaceAccessKey) => {
    showDeleteConfirmation({
      title: t`Delete ${accessKey.name}?`,
      message: t`Anyone using this key will lose access. This cannot be undone.`,
      confirmButtonText: t`Delete`,
      confirmButtonProps: { variant: "filled", color: "error" },
      onConfirm: async () => {
        await deleteAccessKey({
          workspace_id: workspace.id,
          id: accessKey.id,
        }).unwrap();
      },
    });
  };

  return (
    <>
      <TitleSection
        label={t`Access keys`}
        description={t`Create access keys to download workspace configuration without a user session.`}
        rightSection={<Button onClick={openCreate}>{t`Add access key`}</Button>}
      >
        <AccessKeyTable
          accessKeys={accessKeys}
          onEdit={handleEditOpen}
          onDelete={handleDelete}
        />
      </TitleSection>
      {isCreateOpen && (
        <CreateAccessKeyModal workspace={workspace} onClose={closeCreate} />
      )}
      {editingKey != null && (
        <EditAccessKeyModal
          workspace={workspace}
          accessKey={editingKey}
          onClose={handleEditClose}
        />
      )}
      {deleteModalContent}
    </>
  );
}
