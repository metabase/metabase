import type { Editor } from "@tiptap/react";
import { useCallback } from "react";

import { datasetApi } from "metabase/api/dataset";
import { useDispatch } from "metabase/lib/redux";
import type { Card, Dataset } from "metabase-types/api";

import { createDraftCard, getNextDraftCardId } from "../documents.slice";
import { updateCardEmbedNodeId } from "../utils/editorNodeUtils";

/**
 * Hook that provides draft card creation and management operations.
 *
 * Preserves exact behavior from EmbedQuestionSettingsSidebar.
 */
export function useDraftCardOperations(
  draftCard: Card | null | undefined,
  card: Card | null | undefined,
  cardId: number,
  editorInstance: Editor | null | undefined,
  selectedEmbedIndex: number | null,
  regularDataset: Dataset | null | undefined,
) {
  const dispatch = useDispatch();

  const ensureDraftCard = useCallback(
    (initialModifications = {}, isVizSettingsOnly = false) => {
      const baseCard = draftCard || card;
      if (!baseCard) {
        return cardId;
      }

      // If we don't have a draft yet, create one
      if (!draftCard) {
        const isDocumentCard = baseCard.type === "in_document";

        if (isDocumentCard) {
          // For document cards, keep the same ID
          dispatch(
            createDraftCard({
              originalCard: baseCard,
              modifiedData: initialModifications,
            }),
          );
          return cardId;
        } else {
          // For regular cards, create with negative ID
          const newDraftId = getNextDraftCardId();
          dispatch(
            createDraftCard({
              originalCard: baseCard,
              modifiedData: initialModifications,
            }),
          );

          // If this is only a viz settings change, copy the dataset cache
          // to avoid unnecessary loading states (dataset triggers loader, metadata refetch is fine)
          if (isVizSettingsOnly && regularDataset && baseCard.dataset_query) {
            const draftQueryArgs = {
              ...baseCard.dataset_query,
              database: baseCard.database_id ?? null,
              parameters: [],
            };

            // Manually populate the cache for the draft card's dataset query
            dispatch(
              datasetApi.util.upsertQueryData(
                "getAdhocQuery",
                draftQueryArgs,
                regularDataset,
              ),
            );
          }

          // Update the editor node to use the new draft ID
          updateCardEmbedNodeId(editorInstance, selectedEmbedIndex, newDraftId);

          return newDraftId;
        }
      }
      return cardId;
    },
    [
      card,
      draftCard,
      cardId,
      dispatch,
      editorInstance,
      selectedEmbedIndex,
      regularDataset,
    ],
  );

  return {
    ensureDraftCard,
  };
}
