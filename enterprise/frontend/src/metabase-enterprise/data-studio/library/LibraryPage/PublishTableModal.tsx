import { t } from "ttag";

import {
  EntityPickerModal,
  type OmniPickerItem,
  type OmniPickerTableItem,
} from "metabase/common/components/Pickers";
import { trackDataStudioTablePublished } from "metabase/data-studio/analytics";
import { useMetadataToasts } from "metabase/metadata/hooks/useMetadataToasts";
import { usePublishTablesMutation } from "metabase-enterprise/api/table";
import { isConcreteTableId } from "metabase-types/api";

interface PublishTableModalProps {
  opened: boolean;
  onClose: () => void;
  onPublished: (table: OmniPickerTableItem) => void;
}

const isTableItem = (item?: OmniPickerItem): item is OmniPickerTableItem =>
  !!item && item.model === "table";

export function PublishTableModal({
  opened,
  onClose,
  onPublished,
}: PublishTableModalProps) {
  const { sendSuccessToast } = useMetadataToasts();
  const [publishTables] = usePublishTablesMutation();

  const onConfirm = async (item: OmniPickerItem) => {
    if (!isTableItem(item)) {
      return;
    }
    await publishTables({ table_ids: [item.id] }).unwrap(); // unwrap() allows EntityPicker's error handling to take over
    onClose();
    sendSuccessToast(t`Published`);
    if (isConcreteTableId(item.id)) {
      trackDataStudioTablePublished(item.id);
    }
    onPublished(item);
  };

  if (!opened) {
    return null;
  }

  const shouldDisableItem = (item: OmniPickerItem) =>
    item.model === "table" && "is_published" in item && !!item.is_published;

  return (
    <EntityPickerModal
      title={t`Select a table to publish`}
      models={["table"]}
      options={{
        hasLibrary: false,
        hasRecents: false,
        hasDatabases: true,
        hasConfirmButtons: true,
        hasRootCollection: false,
        hasPersonalCollections: false,
        confirmButtonText: t`Publish`,
      }}
      isDisabledItem={shouldDisableItem}
      onChange={onConfirm}
      onClose={onClose}
    />
  );
}
