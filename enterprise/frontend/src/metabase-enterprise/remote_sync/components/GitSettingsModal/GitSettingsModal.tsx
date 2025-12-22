import { t } from "ttag";

import { Modal, Stack, Text } from "metabase/ui";

import { RemoteSyncSettingsForm } from "../RemoteSyncAdminSettings";

export interface GitSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const GitSettingsModal = ({
  isOpen,
  onClose,
}: GitSettingsModalProps) => {
  return (
    <Modal
      opened={isOpen}
      onClose={onClose}
      withCloseButton={false}
      title={
        <Stack gap="sm" mb="md">
          <Text fw={700} size="1.5rem">
            {t`Set up remote sync for your Library`}
          </Text>
          <Text c="text-medium" size="md" fw={400} lh="1.25rem">
            {t`Keep your Library and transforms safely backed up in git.`}
          </Text>
        </Stack>
      }
      size="xl"
      padding="xl"
    >
      <RemoteSyncSettingsForm
        onCancel={onClose}
        onSaveSuccess={onClose}
        variant="settings-modal"
      />
    </Modal>
  );
};
