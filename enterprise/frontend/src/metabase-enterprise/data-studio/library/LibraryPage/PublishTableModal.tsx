import { useState } from "react";
import { t } from "ttag";

import {
  EntityPickerModal,
  type OmniPickerItem,
  type OmniPickerTableItem,
} from "metabase/common/components/Pickers";

import { PublishTablesModal } from "../components/PublishTablesModal";

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
  const [selectedTable, setSelectedTable] =
    useState<OmniPickerTableItem | null>(null);

  const handlePickerConfirm = (item: OmniPickerItem) => {
    if (!isTableItem(item)) {
      return;
    }
    setSelectedTable(item);
  };

  const handleClose = () => {
    setSelectedTable(null);
    onClose();
  };

  const handlePublish = () => {
    if (selectedTable) {
      const table = selectedTable;
      setSelectedTable(null);
      onClose();
      onPublished(table);
    }
  };

  const handlePublishModalClose = () => {
    setSelectedTable(null);
  };

  if (!opened) {
    return null;
  }

  const shouldDisableItem = (item: OmniPickerItem) =>
    item.model === "table" && "is_published" in item && !!item.is_published;

  if (selectedTable) {
    return (
      <PublishTablesModal
        isOpened
        tableIds={[selectedTable.id]}
        onPublish={handlePublish}
        onClose={handlePublishModalClose}
      />
    );
  }

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
      onChange={handlePickerConfirm}
      onClose={handleClose}
    />
  );
}
