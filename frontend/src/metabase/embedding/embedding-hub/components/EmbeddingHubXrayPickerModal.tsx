import { useCallback } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import { DataPickerModal } from "metabase/common/components/Pickers/DataPicker";
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

  const handleTableSelect = useCallback(
    (tableId: TableId) => {
      const url = `/auto/dashboard/table/${tableId}`;
      dispatch(push(url));
    },
    [dispatch],
  );

  if (!opened) {
    return null;
  }

  return (
    <DataPickerModal
      title={t`Choose a table to generate a dashboard`}
      value={undefined}
      models={["table"]}
      onChange={handleTableSelect}
      onClose={onClose}
    />
  );
};
