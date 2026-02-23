import { t } from "ttag";

import { DataPickerModal } from "metabase/common/components/Pickers/DataPicker";
import { useNavigation } from "metabase/routing";
import type { TableId } from "metabase-types/api";

interface EmbeddingHubXrayPickerModalProps {
  opened: boolean;
  onClose: () => void;
}

export const EmbeddingHubXrayPickerModal = ({
  opened,
  onClose,
}: EmbeddingHubXrayPickerModalProps) => {
  const { push } = useNavigation();

  function handleTableSelect(tableId: TableId) {
    push(`/auto/dashboard/table/${tableId}`);
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
