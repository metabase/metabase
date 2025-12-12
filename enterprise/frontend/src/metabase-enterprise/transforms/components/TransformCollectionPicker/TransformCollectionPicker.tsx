import { useCallback, useState } from "react";
import { t } from "ttag";

import { useGetCollectionQuery } from "metabase/api";
import type { CollectionPickerValueItem } from "metabase/common/components/Pickers/CollectionPicker";
import { CollectionPickerModal } from "metabase/common/components/Pickers/CollectionPicker";
import { Button, Icon } from "metabase/ui";
import type { CollectionId } from "metabase-types/api";

export type TransformCollectionPickerProps = {
  collectionId: CollectionId | null;
  onChange: (collectionId: CollectionId | null) => void;
};

export function TransformCollectionPicker({
  collectionId,
  onChange,
}: TransformCollectionPickerProps) {
  const [isOpen, setIsOpen] = useState(false);

  const { data: collection } = useGetCollectionQuery(
    collectionId
      ? { id: collectionId, namespace: "transforms" }
      : { id: "root", namespace: "transforms" },
  );

  const handleChange = useCallback(
    (item: CollectionPickerValueItem) => {
      const newCollectionId: CollectionId | null =
        item.id === "root" ? null : item.id;
      onChange(newCollectionId);
      setIsOpen(false);
    },
    [onChange],
  );

  const displayName =
    collectionId === null ? t`Transforms` : (collection?.name ?? t`Loading...`);

  return (
    <>
      <Button
        variant="default"
        leftSection={<Icon name="folder" />}
        onClick={() => setIsOpen(true)}
      >
        {displayName}
      </Button>

      {isOpen && (
        <CollectionPickerModal
          value={
            collectionId
              ? { id: collectionId, model: "collection" }
              : { id: "root", model: "collection" }
          }
          onChange={handleChange}
          onClose={() => setIsOpen(false)}
          title={t`Select a folder for your transform`}
          options={{
            namespace: "transforms",
            showPersonalCollections: false,
            showRootCollection: true,
            showSearch: true,
            hasConfirmButtons: true,
            hasRecents: false,
            showLibrary: false,
          }}
        />
      )}
    </>
  );
}
