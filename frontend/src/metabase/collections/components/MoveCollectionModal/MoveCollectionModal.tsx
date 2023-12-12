import { useCallback } from "react";
import { t } from "ttag";
import { CollectionMoveModal } from "metabase/containers/CollectionMoveModal";
import type { Collection } from "metabase-types/api";
import { EntityPickerModal } from "metabase/common/components/EntityPicker";

export interface MoveCollectionModalProps {
  collection: Collection;
  onMove: (source: Collection, destination: Collection) => void;
  onClose: () => void;
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
      value={{...collection, model: 'collection'}}
      onChange={handleMove}
      onClose={onClose}
    />
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default MoveCollectionModal;
