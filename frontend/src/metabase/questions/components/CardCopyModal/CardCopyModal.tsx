import { useMemo } from "react";
import { useLatest } from "react-use";

import { useCreateCardMutation } from "metabase/api";
import { useGetDefaultCollectionId } from "metabase/common/collections/hooks";
import { CopyModal } from "metabase/common/components/CopyModal";
import type { CopyCardProperties } from "metabase/questions/components/CopyCardForm";
import type { Card } from "metabase-types/api";
import { exact } from "metabase-types/guards";

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
    const action = createCard(
      exact({
        name: values.name,
        dataset_query: card.dataset_query,
        display: card.display,
        visualization_settings: card.visualization_settings,
        type: card.type,
        parameters: card.parameters,
        parameter_mappings: card.parameter_mappings,
        description: values.description || null,
        collection_id: values.collection_id ?? null,
        dashboard_id: values.dashboard_id,
        document_id: card.document_id,
        collection_position: card.collection_position,
        result_metadata: card.result_metadata,
        cache_ttl: card.cache_ttl,
      }),
    );
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
