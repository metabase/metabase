import { t } from "ttag";

import { Modal } from "metabase/ui";
import type {
  LlmProviderConnection,
  LlmProviderType,
} from "metabase-types/api";

import { ProviderConnectionForm } from "./ProviderConnectionForm";

export function ProviderConnectionModal({
  opened,
  providerTypes,
  connection,
  onClose,
  onClosed,
}: {
  opened: boolean;
  providerTypes: LlmProviderType[];
  connection?: LlmProviderConnection;
  onClose: (saved?: LlmProviderConnection) => void;
  onClosed: () => void;
}) {
  return (
    <Modal
      opened={opened}
      onClose={() => onClose()}
      onExitTransitionEnd={onClosed}
      title={connection ? t`Edit provider` : t`Add a provider`}
      padding="xl"
      size="lg"
    >
      <ProviderConnectionForm
        providerTypes={providerTypes}
        connection={connection}
        onSaved={onClose}
        onCancel={() => onClose()}
      />
    </Modal>
  );
}
