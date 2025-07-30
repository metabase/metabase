import { useCallback } from "react";
import { t } from "ttag";

import { cardApi } from "metabase/api";
import { useToast } from "metabase/common/hooks";
import type { Card } from "metabase-types/api";

import { useReportsDispatch, useReportsStore } from "../redux-utils";
import { clearDraftState } from "../reports.slice";
import {
  getCardEmbeds,
  getHasDraftChanges,
  getReportCardWithDraftSettings,
  getReportsState,
} from "../selectors";

export function useReportActions() {
  const dispatch = useReportsDispatch();
  const store = useReportsStore();
  const [sendToast] = useToast();
  const [createCard] = cardApi.useCreateCardMutation();
  const [updateCard] = cardApi.useUpdateCardMutation();

  const commitVisualizationChanges = useCallback(
    async (embedIndex: number, editorInstance: any, originalCard: Card) => {
      const state = store.getState();
      const hasDraftChanges = getHasDraftChanges(state, originalCard);
      const cardEmbeds = getCardEmbeds(state);

      if (
        !hasDraftChanges ||
        !editorInstance ||
        embedIndex < 0 ||
        embedIndex >= cardEmbeds.length
      ) {
        return;
      }

      const embed = cardEmbeds[embedIndex];
      const cardWithDraftSettings = getReportCardWithDraftSettings(
        state,
        embed.id,
        originalCard,
      );

      if (!cardWithDraftSettings) {
        return;
      }

      try {
        if (!originalCard || !cardWithDraftSettings) {
          return;
        }

        let updatedCard: Card;

        if (originalCard.type === "in_report") {
          // Card is already an in_report type, just update it
          updatedCard = await updateCard({
            id: originalCard.id,
            display: cardWithDraftSettings.display,
            visualization_settings:
              cardWithDraftSettings.visualization_settings,
          }).unwrap();
        } else {
          // Card is a regular card, create a new in_report card
          const { id, created_at, updated_at, ...cardData } =
            cardWithDraftSettings;
          updatedCard = await createCard({
            ...cardData,
            type: "in_report",
            display: cardWithDraftSettings.display,
            visualization_settings:
              cardWithDraftSettings.visualization_settings,
            collection_id: originalCard.collection_id,
          }).unwrap();

          // Update the embed to point to the new card
          const { doc } = editorInstance.state;
          const tr = editorInstance.state.tr;
          let nodeCount = 0;
          let updated = false;

          doc.descendants((node: any, pos: number) => {
            if (updated) {
              return false;
            }

            if (node.type.name === "cardEmbed") {
              if (nodeCount === embedIndex) {
                const newAttrs = {
                  ...node.attrs,
                  id: updatedCard.id,
                };
                tr.setNodeMarkup(pos, undefined, newAttrs);
                updated = true;
                return false;
              }
              nodeCount++;
            }
          });

          if (tr.docChanged) {
            editorInstance.view.dispatch(tr);
          }
        }

        dispatch(clearDraftState());

        sendToast({
          message: t`Visualization settings updated`,
        });
      } catch (error) {
        console.error("Failed to commit visualization changes:", error);
        sendToast({
          message: t`Failed to update visualization settings`,
          icon: "warning",
        });
      }
    },
    [store, dispatch, sendToast, createCard, updateCard],
  );

  // Commit all pending changes (used when saving report)
  const commitAllPendingChanges = useCallback(
    async (editorInstance: any, originalCard?: Card) => {
      if (!editorInstance) {
        return;
      }

      const state = store.getState();
      const hasDraftChanges = getHasDraftChanges(state, originalCard);
      const selectedEmbedIndex = getReportsState(state).selectedEmbedIndex;

      // Commit changes if there are any and we have a selected embed
      if (hasDraftChanges && selectedEmbedIndex !== null && originalCard) {
        await commitVisualizationChanges(
          selectedEmbedIndex,
          editorInstance,
          originalCard,
        );
      }
    },
    [store, commitVisualizationChanges],
  );

  return {
    commitVisualizationChanges,
    commitAllPendingChanges,
  };
}
