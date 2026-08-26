import { t } from "ttag";

import { Modal, type ModalProps } from "metabase/ui";

import { AIProviderSetup } from "./AIProviderConfigurationForm";

export function AIProviderConfigurationModal({
  opened,
  onClose,
}: Pick<ModalProps, "opened" | "onClose">) {
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={t`Connect to an AI provider`}
      size="lg"
      data-testid="ai-provider-configuration-modal"
    >
      <AIProviderSetup onDone={onClose} />
    </Modal>
  );
}
