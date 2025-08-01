import type { Editor } from "@tiptap/react";
import { useCallback } from "react";

import { useCreateCardMutation, useUpdateCardMutation } from "metabase/api";
import type { Card } from "metabase-types/api";

interface CardSaveOptions {
  card: Card;
  modifiedCardData: Partial<Card>;
  editor?: Editor;
}

interface CardSaveResult {
  card_id: number;
  name: string;
}

/**
 * Hook that determines whether to update an existing card or create a new one
 * based on card type and occurrence count in the editor
 */
export const useDocumentCardSave = () => {
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

      // If card is "in_report" type and appears only once in the editor, update it
      // Otherwise, create a new card (for regular cards or duplicated in_report cards)
      if (card.type === "in_report" && cardOccurrences <= 1) {
        // Card is already an in_report type and appears only once, just update it
        await updateCard({
          id: card.id,
          ...modifiedCardData,
        });

        return {
          card_id: card.id,
          name: cardName,
        };
      } else {
        // Card is either:
        // 1. A regular card (not in_report type), or
        // 2. An in_report card that appears multiple times (was copy-pasted)
        // In both cases, create a new in_report card
        const { id, created_at, updated_at, ...cardData } = card;
        const savedCard = await createCard({
          ...cardData,
          ...modifiedCardData,
          type: "in_report",
          collection_id: card.collection_id ?? null,
        }).unwrap();

        return {
          card_id: savedCard.id,
          name: cardName,
        };
      }
    },
    [countCardOccurrences, createCard, updateCard],
  );

  return { saveCard };
};
