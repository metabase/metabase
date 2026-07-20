import { t } from "ttag";

import { Button, Group, Modal, Stack, Text } from "metabase/ui";
import { useDeleteWorkspaceMutation } from "metabase-enterprise/api";
import type { WorkspaceId } from "metabase-types/api";

type DeleteModalProps = {
  workspaceId: WorkspaceId;
  opened: boolean;
  onClose: () => void;
};

export function DeleteModal({
  workspaceId,
  opened,
  onClose,
}: DeleteModalProps) {
  return (
    <Modal
      title={t`Delete workspace`}
      opened={opened}
      padding="xl"
      onClose={onClose}
    >
      <DeleteModalBody workspaceId={workspaceId} onClose={onClose} />
    </Modal>
  );
}

type DeleteModalBodyProps = {
  workspaceId: WorkspaceId;
  onClose: () => void;
};

function DeleteModalBody({ workspaceId, onClose }: DeleteModalBodyProps) {
  const [deleteWorkspace, { isLoading }] = useDeleteWorkspaceMutation();

  const handleDelete = async () => {
    await deleteWorkspace(workspaceId);
    onClose();
  };

  return (
    <Stack gap="lg">
      <Text>{t`This will delete the workspace. This can't be undone.`}</Text>
      <Group justify="flex-end">
        <Button onClick={onClose}>{t`Cancel`}</Button>
        <Button
          variant="filled"
          color="feedback-negative"
          loading={isLoading}
          onClick={handleDelete}
        >
          {t`Delete`}
        </Button>
      </Group>
    </Stack>
  );
}
