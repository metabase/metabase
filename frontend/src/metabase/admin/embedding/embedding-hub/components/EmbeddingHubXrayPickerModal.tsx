import { push } from "react-router-redux";
import { t } from "ttag";

import { DataPickerModal } from "metabase/common/components/Pickers/DataPicker";
import { RETURN_TO_SETUP_GUIDE_PARAM } from "metabase/embed/constants";
import { useDispatch } from "metabase/utils/redux";
import type { TableId } from "metabase-types/api";

interface EmbeddingHubXrayPickerModalProps {
  opened: boolean;
  onClose: () => void;
  fromEmbeddingSetupGuide?: boolean;
}

export const EmbeddingHubXrayPickerModal = ({
  opened,
  onClose,
  fromEmbeddingSetupGuide,
}: EmbeddingHubXrayPickerModalProps) => {
  const dispatch = useDispatch();

  function handleTableSelect(tableId: TableId) {
    const params = fromEmbeddingSetupGuide
      ? `?${RETURN_TO_SETUP_GUIDE_PARAM}=true`
      : "";
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
