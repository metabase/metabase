import type { NodeViewProps } from "@tiptap/core";
import { useCallback } from "react";

import { useUpdateCardMutation } from "metabase/api/card";
import { useCreateDocumentCardMutation } from "metabase/api/document";
import { navigateToCardFromDocument } from "metabase/documents/actions";
import type { UseCardDataResult } from "metabase/documents/hooks/use-card-data";
import { updateCardEmbedNodeId } from "metabase/documents/utils/editorNodeUtils";
import { getMetadata } from "metabase/selectors/metadata";
import { useDispatch, useSelector } from "metabase/utils/redux";
import Question from "metabase-lib/v1/Question";
import { getUrl } from "metabase-lib/v1/urls";
import type {
  Card,
  CardDisplayType,
  Document,
  VisualizationSettings,
} from "metabase-types/api";

export const useUpdateCardOperations = ({
  document,
  question,
  regularCardData,
  editor,
  embedIndex,
}: {
  document: Document | null;
  question: Question | undefined;
  regularCardData: UseCardDataResult;
  editor: NodeViewProps["editor"];
  embedIndex: number;
  cardId: number;
}) => {
  const dispatch = useDispatch();
  const metadata = useSelector(getMetadata);

  const { card } = regularCardData;

  const [updateCard] = useUpdateCardMutation();
  const [createDocumentCard] = useCreateDocumentCardMutation();

  // Handle drill-through navigation
  const handleChangeCardAndRun = useCallback(
    ({
      nextCard,
    }: {
      nextCard: Card;
      previousCard?: Card;
      objectId?: number;
    }) => {
      if (!metadata) {
        console.warn("Metadata not available for drill-through navigation");
        return;
      }

      try {
        // For drill-through, we need to ensure the card is treated as adhoc
        // Remove the ID so getUrl creates an adhoc question URL instead of navigating to saved question
        const adhocCard = { ...nextCard, id: null };
        const question = new Question(adhocCard, metadata);
        const url = getUrl(question, { includeDisplayIsLocked: true });
        dispatch(navigateToCardFromDocument(url, document));
      } catch (error) {
        console.error("Failed to create question URL:", error);
        // Fallback: navigate to a new question with the dataset_query
        if (nextCard.dataset_query) {
          const params = new URLSearchParams();
          params.set("dataset_query", JSON.stringify(nextCard.dataset_query));
          dispatch(
            navigateToCardFromDocument(
              `/question?${params.toString()}`,
              document,
            ),
          );
        }
      }
    },
    [dispatch, metadata, document],
  );

  const handleUpdateVisualizationSettings = useCallback(
    async (settings: VisualizationSettings) => {
      if (!card || !document || embedIndex === null) {
        return;
      }
      const nextSettings = {
        ...card.visualization_settings,
        ...settings,
      };
      try {
        if (card.document_id === document.id && card.id != null) {
          await updateCard({
            id: card.id,
            visualization_settings: nextSettings,
          }).unwrap();
        } else {
          const created = await createDocumentCard({
            document_id: document.id,
            name: card.name,
            dataset_query: card.dataset_query,
            display: card.display as CardDisplayType,
            visualization_settings: nextSettings,
          }).unwrap();
          updateCardEmbedNodeId(editor, embedIndex, created.id);
        }
      } catch (error) {
        console.error("Failed to update visualization settings:", error);
      }
    },
    [card, document, embedIndex, editor, updateCard, createDocumentCard],
  );

  const handleUpdateQuestion = useCallback(() => {
    if (question) {
      // this is used by HideColumn action, which changes the question, but in reality it updates visualization_settings
      const newVizSettings = question.card().visualization_settings;

      handleUpdateVisualizationSettings(newVizSettings);
    }
  }, [handleUpdateVisualizationSettings, question]);

  return {
    handleChangeCardAndRun,
    handleUpdateQuestion,
    handleUpdateVisualizationSettings,
  };
};
