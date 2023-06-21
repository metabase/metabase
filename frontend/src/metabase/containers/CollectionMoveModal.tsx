import { useState } from "react";

import { t } from "ttag";

import Button from "metabase/core/components/Button";
import ModalContent from "metabase/components/ModalContent";

import CollectionPicker from "metabase/containers/CollectionPicker";
import CreateCollectionModal from "metabase/collections/containers/CreateCollectionModal";
import { Collection } from "metabase-types/api";
import { ButtonContainer } from "./CollectionMoveModal.styled";

interface CollectionMoveModalProps {
  title: string;
  onClose: () => void;
  onMove: (collection: any) => void;
  initialCollectionId?: number | string | null;
}

export const CollectionMoveModal = ({
  title,
  onClose,
  onMove,
  initialCollectionId,
}: CollectionMoveModalProps) => {
  // will eventually be the collection object representing the selected collection
  // we store the whole object instead of just the ID so that we can use its
  // name in the action button, and other properties
  //
  //  undefined = no selection
  //  null = root collection
  //  number = non-root collection id
  //
  const [selectedCollectionId, setSelectedCollectionId] =
    useState(initialCollectionId);

  // whether the move action has started
  // TODO: use this loading and error state in the UI
  // const [moving, setMoving] = useState(false);
  // const [error, setError] = useState(null);

  const [creatingCollection, setCreatingCollection] = useState(false);

  if (creatingCollection) {
    return (
      <CreateCollectionModal
        onCreate={(collection: Collection) => {
          onMove({ id: collection.id });
        }}
        onClose={() => setCreatingCollection(false)}
      ></CreateCollectionModal>
    );
  }

  return (
    <ModalContent title={title} onClose={onClose}>
      <CollectionPicker
        value={selectedCollectionId}
        onChange={setSelectedCollectionId}
      />
      <ButtonContainer>
        <Button light icon="add" onClick={() => setCreatingCollection(true)}>
          {t`New collection`}
        </Button>
        <Button
          primary
          className="ml-auto"
          disabled={
            selectedCollectionId === undefined ||
            selectedCollectionId === initialCollectionId
          }
          onClick={() => {
            try {
              // setMoving(true);
              onMove({ id: selectedCollectionId });
            } catch (e) {
              // setError(e);
            } finally {
              // setMoving(false);
            }
          }}
        >
          {t`Move`}
        </Button>
      </ButtonContainer>
    </ModalContent>
  );
};
