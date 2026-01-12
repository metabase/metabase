import type { NodeViewProps } from "@tiptap/core";
import { useCallback } from "react";

import { navigateToCardFromDocument } from "metabase/documents/actions";
import { updateVizSettings } from "metabase/documents/documents.slice";
import type { UseCardDataResult } from "metabase/documents/hooks/use-card-data";
import { useDraftCardOperations } from "metabase/documents/hooks/use-draft-card-operations";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { getMetadata } from "metabase/selectors/metadata";
import Question from "metabase-lib/v1/Question";
import { getUrl } from "metabase-lib/v1/urls";
import type { Card, Document, VisualizationSettings } from "metabase-types/api";

export const useUpdateCardOperations = ({
  document,
  question,
  regularCardData,
  editor,
  embedIndex,
  cardId,
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

  const { card, draftCard, regularDataset } = regularCardData;

  const { ensureDraftCard } = useDraftCardOperations(
    draftCard,
    card,
    cardId,
    editor,
    embedIndex,
    regularDataset,
  );

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
    (settings: VisualizationSettings) => {
      if (embedIndex !== null) {
        if (!draftCard) {
          const baseCard = card;
          const newSettings = {
            ...baseCard?.visualization_settings,
            ...settings,
          };
          const actualCardId = ensureDraftCard(
            { visualization_settings: newSettings },
            true,
          );
          dispatch(updateVizSettings({ cardId: actualCardId, settings }));
        } else {
          dispatch(updateVizSettings({ cardId, settings }));
        }
      }
    },
    [card, cardId, dispatch, draftCard, embedIndex, ensureDraftCard],
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
