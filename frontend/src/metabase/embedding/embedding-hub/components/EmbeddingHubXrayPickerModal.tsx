import { t } from "ttag";

import { DataPickerModal } from "metabase/common/components/Pickers/DataPicker";
import type { TableId } from "metabase-types/api";

interface EmbeddingHubXrayPickerModalProps {
  opened: boolean;
  onClose: () => void;
  onTableSelect?: (url: string) => void;
}

export const EmbeddingHubXrayPickerModal = ({
  opened,
  onClose,
  onTableSelect,
}: EmbeddingHubXrayPickerModalProps) => {
  function handleTableSelect(tableId: TableId) {
    onTableSelect?.(`/auto/dashboard/table/${tableId}`);
    onClose();
  }

  if (!opened) {
    return null;
  }

  return (
    <DataPickerModal
      title={t`Choose a table to generate a dashboard`}
      models={["table"]}
      onChange={handleTableSelect}
      onClose={onClose}
      options={{
        hasLibrary: false,
        hasRootCollection: false,
        hasPersonalCollections: false,
      }}
    />
  );
};
