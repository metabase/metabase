import type { Editor } from "@tiptap/react";
import { useCallback } from "react";

import { datasetApi } from "metabase/api/dataset";
import { useDispatch } from "metabase/lib/redux";
import type { Card, Dataset } from "metabase-types/api";

import { createDraftCard, generateDraftCardId } from "../documents.slice";
import { updateCardEmbedNodeId } from "../utils/editorNodeUtils";

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
    (initialModifications: Partial<Card> = {}, isVizSettingsOnly = false) => {
      const baseCard = draftCard || card;
      if (!baseCard) {
        return cardId;
      }

      if (!draftCard) {
        const newDraftId = generateDraftCardId();
        updateCardEmbedNodeId(editorInstance, selectedEmbedIndex, newDraftId);

        dispatch(
          createDraftCard({
            originalCard: baseCard,
            modifiedData: initialModifications,
            draftId: newDraftId,
          }),
        );

        // Copy dataset cache to avoid loader when only changing viz settings
        if (isVizSettingsOnly && regularDataset && baseCard.dataset_query) {
          const draftQueryArgs = {
            ...baseCard.dataset_query,
            database: baseCard.database_id ?? null,
            parameters: [],
          };

          dispatch(
            datasetApi.util.upsertQueryData(
              "getAdhocQuery",
              draftQueryArgs,
              regularDataset,
            ),
          );
        }

        return newDraftId;
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
