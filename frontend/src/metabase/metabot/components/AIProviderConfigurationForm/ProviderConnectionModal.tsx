import { t } from "ttag";

import { Modal } from "metabase/ui";
import type {
  LlmProviderConnection,
  LlmProviderType,
} from "metabase-types/api";

import { ProviderConnectionForm } from "./ProviderConnectionForm";

export function ProviderConnectionModal({
  providerTypes,
  connection,
  onClose,
}: {
  providerTypes: LlmProviderType[];
  connection?: LlmProviderConnection;
  onClose: (saved?: LlmProviderConnection) => void;
}) {
  return (
    <Modal
      density="relaxed"
      opened
      onClose={() => onClose()}
      title={connection ? t`Edit provider` : t`Add a provider`}
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
