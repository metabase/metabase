import { t } from "ttag";

import type { RemoteSyncSettingsModalProps } from "metabase/plugins";
import { Modal, Stack, Text } from "metabase/ui";

import { SettingsForm } from "../SettingsForm";

export const SettingsModal = ({
  isOpen,
  onClose,
}: RemoteSyncSettingsModalProps) => (
  <Modal
    opened={isOpen}
    title={t`Set up remote sync for your Library`}
    size="xl"
    onClose={onClose}
  >
    <ModalBody onClose={onClose} />
  </Modal>
);

type ModalBodyProps = {
  onClose: () => void;
};

const ModalBody = ({ onClose }: ModalBodyProps) => (
  <Stack gap="lg">
    <Text c="text-secondary">{t`Keep your Library and transforms safely backed up in Git.`}</Text>
    <SettingsForm
      triggeredFrom="data-studio"
      onSaved={onClose}
      onCancel={onClose}
    />
  </Stack>
);
