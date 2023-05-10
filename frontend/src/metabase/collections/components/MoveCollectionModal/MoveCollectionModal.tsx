import React, { useCallback } from "react";
import CollectionMoveModal from "metabase/containers/CollectionMoveModal";
import { Collection } from "metabase-types/api";

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
    <CollectionMoveModal
      title={`Move ${collection.name}?`}
      initialCollectionId={collection.id}
      onMove={handleMove}
      onClose={onClose}
    />
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default MoveCollectionModal;
