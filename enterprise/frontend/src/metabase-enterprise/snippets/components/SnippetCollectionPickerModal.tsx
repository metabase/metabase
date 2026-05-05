import { useCallback } from "react";
import { t } from "ttag";

import type { OmniPickerItem } from "metabase/common/components/Pickers";
import { CollectionPickerModal } from "metabase/common/components/Pickers";
import type { SnippetCollectionPickerModalProps } from "metabase/plugins";
import type { CollectionId } from "metabase-types/api";

export function SnippetCollectionPickerModal({
  isOpen,
  onSelect,
  onClose,
}: SnippetCollectionPickerModalProps) {
  const handleChange = useCallback(
    (item: OmniPickerItem) => {
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
      namespaces={["snippets"]}
      options={{
        hasPersonalCollections: false,
        canCreateCollections: true,
        hasRootCollection: true,
        hasSearch: false,
        hasConfirmButtons: true,
        hasRecents: false,
        hasLibrary: false,
      }}
    />
  );
}
