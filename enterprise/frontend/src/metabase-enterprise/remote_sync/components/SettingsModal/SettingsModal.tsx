import { t } from "ttag";

import type { RemoteSyncSettingsModalProps } from "metabase/plugins";
import { FocusTrap, Modal, Stack, Text } from "metabase/ui";

import { SettingsForm } from "../SettingsForm";

export function SettingsModal({
  opened,
  onClose,
}: RemoteSyncSettingsModalProps) {
  return (
    <Modal
      opened={opened}
      title={t`Set up remote sync for your Library`}
      size="xl"
      onClose={onClose}
    >
      <FocusTrap.InitialFocus />
      <ModalBody onClose={onClose} />
    </Modal>
  );
}

type ModalBodyProps = {
  onClose: () => void;
};

function ModalBody({ onClose }: ModalBodyProps) {
  return (
    <Stack gap="lg">
      <Text c="text-secondary">{t`Keep your content in sync with a git repository.`}</Text>
      <SettingsForm
        triggeredFrom="data-studio"
        onSaved={onClose}
        onCancel={onClose}
      />
    </Stack>
  );
}
