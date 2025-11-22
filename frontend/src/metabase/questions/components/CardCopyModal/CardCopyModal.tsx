import { useMemo } from "react";

import { useCreateCardMutation } from "metabase/api";
import { useGetDefaultCollectionId } from "metabase/collections/hooks";
import EntityCopyModal from "metabase/entities/containers/EntityCopyModal";
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

  const initialValues = useMemo(
    () => ({
      ...card,
      collection_id: card.can_write ? card.collection_id : initialCollectionId,
    }),
    [card, initialCollectionId],
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
    onCopy?.(newCard);
  };

  return (
    <EntityCopyModal
      entityType="cards"
      entityObject={initialValues}
      copy={handleCopy}
      onSaved={handleCopySucceeded}
      onClose={onClose}
    />
  );
}
