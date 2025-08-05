import type { Editor } from "@tiptap/react";
import { useCallback } from "react";

import { useCreateCardMutation, useUpdateCardMutation } from "metabase/api";
import type { Card, RegularCollectionId } from "metabase-types/api";

interface CardSaveOptions {
  card: Card;
  modifiedCardData: Partial<Card>;
  editor?: Editor;
}

interface CardSaveResult {
  card_id: number;
  name: string;
}

export const useDocumentCardSave = (
  documentCollectionId: RegularCollectionId | null,
) => {
  const [createCard] = useCreateCardMutation();
  const [updateCard] = useUpdateCardMutation();

  const countCardOccurrences = useCallback(
    (editor: Editor | undefined, cardId: number): number => {
      if (!editor) {
        return 1;
      }

      let count = 0;
      editor.state.doc.descendants((node) => {
        if (node.type.name === "cardEmbed" && node.attrs.id === cardId) {
          count++;
        }
      });

      return count;
    },
    [],
  );

  const saveCard = useCallback(
    async ({
      card,
      modifiedCardData,
      editor,
    }: CardSaveOptions): Promise<CardSaveResult> => {
      const cardName = modifiedCardData.name || card.name;
      const cardOccurrences = countCardOccurrences(editor, card.id);

      if (card.document_id && cardOccurrences <= 1) {
        await updateCard({
          id: card.id,
          ...modifiedCardData,
        });

        return {
          card_id: card.id,
          name: cardName,
        };
      } else {
        const { id, created_at, updated_at, ...cardData } = card;
        const savedCard = await createCard({
          ...cardData,
          ...modifiedCardData,
          collection_id: documentCollectionId,
          dashboard_id: null,
        }).unwrap();

        return {
          card_id: savedCard.id,
          name: cardName,
        };
      }
    },
    [countCardOccurrences, createCard, documentCollectionId, updateCard],
  );

  return { saveCard };
};
