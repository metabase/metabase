import { t } from "ttag";

import { Button, Group, Modal, Stack, Text } from "metabase/ui";
import { useDeleteWorkspaceMutation } from "metabase-enterprise/api";
import type { Workspace } from "metabase-types/api";

type DeleteModalProps = {
  workspace: Workspace;
  opened: boolean;
  onClose: () => void;
};

export function DeleteModal({ workspace, opened, onClose }: DeleteModalProps) {
  return (
    <Modal
      title={t`Delete workspace`}
      opened={opened}
      padding="xl"
      onClose={onClose}
    >
      <DeleteModalBody workspace={workspace} onClose={onClose} />
    </Modal>
  );
}

type DeleteModalBodyProps = {
  workspace: Workspace;
  onClose: () => void;
};

function DeleteModalBody({ workspace, onClose }: DeleteModalBodyProps) {
  const [deleteWorkspace, { isLoading }] = useDeleteWorkspaceMutation();

  const handleDelete = async () => {
    await deleteWorkspace(workspace.id);
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
