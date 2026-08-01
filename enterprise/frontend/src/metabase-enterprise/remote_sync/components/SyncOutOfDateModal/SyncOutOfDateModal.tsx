import { t } from "ttag";

import { Button, Group, Modal, Text } from "metabase/ui";

type SyncOutOfDateModalProps = {
  message: string;
  onClose: VoidFunction;
};

/**
 * Shown when the backend rejects a sync action because the branch moved in another session:
 * everything on screen was built for the old branch, so the only safe way on is a reload.
 */
export const SyncOutOfDateModal = ({
  message,
  onClose,
}: SyncOutOfDateModalProps) => (
  <Modal
    opened
    padding="xl"
    title={t`This view is out of date`}
    withCloseButton={false}
    onClose={onClose}
  >
    <Text mt="md">{message}</Text>
    <Group gap="sm" justify="end" mt="xl">
      <Button variant="subtle" onClick={onClose}>
        {t`Cancel`}
      </Button>
      <Button variant="filled" onClick={() => window.location.reload()}>
        {t`Refresh`}
      </Button>
    </Group>
  </Modal>
);
