import { useState } from "react";
import { t } from "ttag";

import CreateCollectionModal from "metabase/collections/containers/CreateCollectionModal";
import ModalContent from "metabase/components/ModalContent";
import CollectionPicker from "metabase/containers/CollectionPicker";
import Button from "metabase/core/components/Button";
import type { Collection, CollectionId } from "metabase-types/api";

import { ButtonContainer } from "./MoveModal.styled";

interface MoveModalProps {
  title: string;
  onClose: () => void;
  onMove: (collection: any) => void;
  initialCollectionId?: number | string | null;
}

export const MoveModal = ({
  title,
  onClose,
  onMove,
  initialCollectionId,
}: MoveModalProps) => {
  const [selectedCollectionId, setSelectedCollectionId] =
    useState(initialCollectionId);

  const [creatingCollection, setCreatingCollection] = useState(false);
  const [openCollectionId, setOpenCollectionId] = useState<CollectionId>();

  if (creatingCollection) {
    return (
      <CreateCollectionModal
        collectionId={openCollectionId}
        onClose={() => setCreatingCollection(false)}
        onCreate={(collection: Collection) => {
          onMove({ id: collection.id });
        }}
      />
    );
  }

  return (
    <ModalContent title={title} onClose={onClose}>
      <CollectionPicker
        initialOpenCollectionId={openCollectionId}
        onOpenCollectionChange={setOpenCollectionId}
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
          onClick={() => onMove({ id: selectedCollectionId })}
        >
          {t`Move`}
        </Button>
      </ButtonContainer>
    </ModalContent>
  );
};
