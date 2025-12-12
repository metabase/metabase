import { useCallback } from "react";
import { t } from "ttag";

import type { CollectionPickerValueItem } from "metabase/common/components/Pickers/CollectionPicker";
import { CollectionPickerModal } from "metabase/common/components/Pickers/CollectionPicker";
import type { SnippetCollectionPickerModalProps } from "metabase/plugins";
import type { CollectionId } from "metabase-types/api";

export function SnippetCollectionPickerModal({
  isOpen,
  onSelect,
  onClose,
}: SnippetCollectionPickerModalProps) {
  const handleChange = useCallback(
    (item: CollectionPickerValueItem) => {
      const collectionId: CollectionId | null =
        item.id === "root" ? null : item.id;
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
        showLibrary: false,
      }}
    />
  );
}
