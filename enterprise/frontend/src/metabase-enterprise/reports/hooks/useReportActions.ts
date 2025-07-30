import { useCallback } from "react";
import { t } from "ttag";

import { cardApi } from "metabase/api";
import { useToast } from "metabase/common/hooks";
import { isNotNull } from "metabase/lib/types";

import type { CardEmbedRef } from "../components/Editor/types";
import {
  useReportsDispatch,
  useReportsSelector,
  useReportsStore,
} from "../redux-utils";
import {
  clearDraftState,
  fetchReportQuestionData,
  updateCardEmbeds,
} from "../reports.slice";
import {
  getCardEmbeds,
  getHasDraftChanges,
  getReportCard,
  getReportCardWithDraftSettings,
  getReportsState,
} from "../selectors";

export function useReportActions() {
  const dispatch = useReportsDispatch();
  const store = useReportsStore();
  const cardEmbeds = useReportsSelector(getCardEmbeds);
  const [sendToast] = useToast();
  const [createCard] = cardApi.useCreateCardMutation();
  const [updateCard] = cardApi.useUpdateCardMutation();

  const commitVisualizationChanges = useCallback(
    async (embedIndex: number, editorInstance: any) => {
      const state = store.getState();
      const hasDraftChanges = getHasDraftChanges(state);
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
      );

      if (!cardWithDraftSettings) {
        return;
      }

      try {
        const originalCard = getReportCard(state, embed.id);
        if (!originalCard || !cardWithDraftSettings) {
          return;
        }

        let updatedCard;

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

        // Force refresh the card data to show latest changes
        dispatch(
          fetchReportQuestionData({
            cardId: updatedCard.id,
            forceRefresh: true,
          }),
        );

        dispatch(updateCardEmbeds([{ embedIndex }]));

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
    async (editorInstance: any) => {
      if (!editorInstance) {
        return;
      }

      const state = store.getState();
      const hasDraftChanges = getHasDraftChanges(state);
      const selectedEmbedIndex = getReportsState(state).selectedEmbedIndex;

      // Commit changes if there are any and we have a selected embed
      if (hasDraftChanges && selectedEmbedIndex !== null) {
        await commitVisualizationChanges(selectedEmbedIndex, editorInstance);
      }
    },
    [store, commitVisualizationChanges],
  );

  const refreshAllData = useCallback(
    async (editorInstance: any) => {
      if (!editorInstance || cardEmbeds.length === 0) {
        return;
      }

      try {
        // Simply refetch data for all card embeds
        const refreshPromises = cardEmbeds.map(
          async (cardEmbed: CardEmbedRef, index: number) => {
            const state = store.getState();
            const card = getReportCard(state, cardEmbed.id);
            if (!card || card.id.toString().includes("static")) {
              return null;
            }

            // Fetch latest data for this card
            dispatch(
              fetchReportQuestionData({
                cardId: cardEmbed.id,
                forceRefresh: true,
              }),
            );

            return {
              embedIndex: index,
            };
          },
        );

        const refreshResults = await Promise.all(refreshPromises);
        const validResults = refreshResults.filter(isNotNull);

        // Update cardEmbeds state to trigger refresh
        dispatch(updateCardEmbeds(validResults));

        sendToast({
          message: t`All data refreshed`,
        });
      } catch (error) {
        console.error("Failed to refresh all data:", error);
        sendToast({ message: t`Error refreshing data`, icon: "warning" });
      }
    },
    [cardEmbeds, store, dispatch, sendToast],
  );

  return {
    commitVisualizationChanges,
    commitAllPendingChanges,
    refreshAllData,
  };
}
