import { t } from "ttag";

import { Modal, Text } from "metabase/ui";

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
        <Text fw={700} size="1.5rem">
          {t`Set up remote sync for your semantic layer`}
        </Text>
      }
      size="xl"
      padding="xxl"
    >
      <Text c="text-secondary" size="md" fw={400} lh="1.25rem" mb="xl">
        {t`Keep your semantic layer and transforms safely backed up in Git.`}
      </Text>
      <RemoteSyncSettingsForm
        onCancel={onClose}
        onSaveSuccess={onClose}
        variant="settings-modal"
      />
    </Modal>
  );
};
