import { useCallback } from "react";
import { t } from "ttag";
import type { Collection } from "metabase-types/api";
import { EntityPickerModal } from "metabase/common/components/EntityPicker";

export interface MoveCollectionModalProps {
  collection: Collection;
  onMove: (source: Collection, destination: Collection) => void;
  onClose: () => void;
}

const isCollection = (item: any): item is Collection => {
  return item?.model === "collection";
}

const MoveCollectionModal = ({
  collection,
  onMove,
  onClose,
}: MoveCollectionModalProps): JSX.Element => {
  const handleMove = useCallback(
    async (destination: Collection) => {
      await onMove(collection, destination);
      onClose();
    },
    [collection, onMove, onClose],
  );

  return (
    <EntityPickerModal
      title={t`Move "${collection.name}"?`}
      tabs={["collection"]}
      value={{
        id: collection.id as number,
        model: 'collection'
      }}
      onChange={(item) => {
        if (isCollection(item)) {
          handleMove(item);
        }
      }}
      onClose={onClose}
    />
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default MoveCollectionModal;
