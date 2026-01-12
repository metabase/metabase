import { push } from "react-router-redux";
import { t } from "ttag";

import { DataPickerModal } from "metabase/common/components/Pickers/DataPicker";
import type { TablePickerValue } from "metabase/common/components/Pickers/TablePicker";
import { useDispatch } from "metabase/lib/redux";
import type { TableId } from "metabase-types/api";

interface EmbeddingHubXrayPickerModalProps {
  opened: boolean;
  onClose: () => void;
}

export const EmbeddingHubXrayPickerModal = ({
  opened,
  onClose,
}: EmbeddingHubXrayPickerModalProps) => {
  const dispatch = useDispatch();

  function handleTableSelect(tableId: TableId) {
    dispatch(push(`/auto/dashboard/table/${tableId}`));
  }

  if (!opened) {
    return null;
  }

  return (
    <DataPickerModal
      title={t`Choose a table to generate a dashboard`}
      value={{ model: "table", id: null } as unknown as TablePickerValue}
      models={["table"]}
      onChange={handleTableSelect}
      onClose={onClose}
      options={{
        showLibrary: false,
        showRootCollection: false,
        showPersonalCollections: false,
      }}
    />
  );
};
