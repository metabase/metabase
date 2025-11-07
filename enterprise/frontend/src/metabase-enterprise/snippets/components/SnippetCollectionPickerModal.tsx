import { useCallback } from "react";
import { t } from "ttag";

import type { CollectionPickerValueItem } from "metabase/common/components/Pickers/CollectionPicker";
import { CollectionPickerModal } from "metabase/common/components/Pickers/CollectionPicker";
import type { RegularCollectionId } from "metabase-types/api";

interface SnippetCollectionPickerModalProps {
  isOpen: boolean;
  onSelect: (collectionId: RegularCollectionId | null) => void;
  onClose: () => void;
}

export function SnippetCollectionPickerModal({
  isOpen,
  onSelect,
  onClose,
}: SnippetCollectionPickerModalProps) {
  const handleChange = useCallback(
    (item: CollectionPickerValueItem) => {
      const collectionId = item.id === "root" ? null : item.id;
      onSelect(collectionId);
    },
    [onSelect],
  );

  if (!isOpen) {
    return null;
  }

  return (
    <CollectionPickerModal
      value={undefined}
      onChange={handleChange}
      onClose={onClose}
      title={t`Select a folder for your snippet`}
      options={{
        namespace: "snippets",
        showPersonalCollections: false,
        showRootCollection: true,
        showSearch: false,
        hasConfirmButtons: true,
        hasRecents: false,
      }}
    />
  );
}
