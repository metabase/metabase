import { useMemo } from "react";
import { useLatest } from "react-use";

import { useCreateCardMutation } from "metabase/api";
import { useGetDefaultCollectionId } from "metabase/common/collections/hooks";
import { CopyModal } from "metabase/common/components/CopyModal";
import type { CopyCardProperties } from "metabase/questions/components/CopyCardForm";
import type { Card } from "metabase-types/api";

type CardCopyModalProps = {
  card: Card;
  onCopy?: (newCard: Card) => void;
  onClose: () => void;
};

export function CardCopyModal({ card, onCopy, onClose }: CardCopyModalProps) {
  const [createCard] = useCreateCardMutation();
  const initialCollectionId = useGetDefaultCollectionId();

  const cardRef = useLatest(card);
  const initialValues = useMemo(
    () => ({
      ...cardRef.current,
      collection_id: cardRef.current.can_write
        ? cardRef.current.collection_id
        : initialCollectionId,
    }),
    [cardRef, initialCollectionId],
  );

  const handleCopy = async (values: CopyCardProperties) => {
    const action = createCard({
      ...card,
      name: values.name,
      description: values.description || null,
      collection_id: values.collection_id ?? null,
      dashboard_id: values.dashboard_id,
    });
    return await action.unwrap();
  };

  const handleCopySucceeded = (newCard: Card) => {
    onClose();
    onCopy?.(newCard);
  };

  return (
    <CopyModal
      entityType="cards"
      entityObject={initialValues}
      copy={handleCopy}
      onSaved={handleCopySucceeded}
      onClose={onClose}
    />
  );
}
