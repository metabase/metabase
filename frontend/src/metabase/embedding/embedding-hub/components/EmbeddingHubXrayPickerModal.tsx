import { push } from "react-router-redux";
import { t } from "ttag";

import { DataPickerModal } from "metabase/common/components/Pickers/DataPicker";
import { useDispatch } from "metabase/lib/redux";
import type { TableId } from "metabase-types/api";

interface EmbeddingHubXrayPickerModalProps {
  opened: boolean;
  onClose: () => void;
  returnTo?: string;
}

export const EmbeddingHubXrayPickerModal = ({
  opened,
  onClose,
  returnTo,
}: EmbeddingHubXrayPickerModalProps) => {
  const dispatch = useDispatch();

  function handleTableSelect(tableId: TableId) {
    const params = returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : "";
    dispatch(push(`/auto/dashboard/table/${tableId}${params}`));
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
