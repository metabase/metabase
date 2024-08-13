import { useCallback } from "react";
import { t } from "ttag";

import type { OnMoveWithSourceAndDestination } from "metabase/collections/types";
import { useCollectionQuery } from "metabase/common/hooks";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import { MoveModal } from "metabase/containers/MoveModal";
import Collections from "metabase/entities/collections";
import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import type { Collection, CollectionId } from "metabase-types/api";

export interface MoveCollectionModalProps {
  collection: Collection;
  onMove: OnMoveWithSourceAndDestination;
  onClose: () => void;
}

const MoveCollectionModalView = ({
  collection,
  onMove,
  onClose,
}: MoveCollectionModalProps): JSX.Element => {
  const handleMove = useCallback(
    async (destination: { id: CollectionId }) => {
      await onMove(collection, destination);
      onClose();
    },
    [collection, onMove, onClose],
  );

  return (
    <MoveModal
      title={t`Move "${collection.name}"?`}
      initialCollectionId={collection.parent_id ?? "root"}
      movingCollectionId={collection.id}
      onMove={handleMove}
      onClose={onClose}
    />
  );
};

// used with ModalRoute router
export const MoveCollectionModal = ({
  collectionId,
  params,
  onClose,
}: {
  collectionId?: CollectionId;
  params?: { slug: string };
  onClose: () => void;
}) => {
  const dispatch = useDispatch();
  const collectionIdfromUrl = Urls.extractCollectionId(params?.slug);

  const {
    data: collection,
    isLoading,
    error,
  } = useCollectionQuery({
    id: collectionId ?? collectionIdfromUrl,
    enabled: Boolean(collectionId || collectionIdfromUrl),
  });

  if (!collection || error) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  return (
    <MoveCollectionModalView
      collection={collection}
      onMove={async (source, destination) => {
        await dispatch(Collections.actions.setCollection(source, destination));
      }}
      onClose={onClose}
    />
  );
};
