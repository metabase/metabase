import { useCallback } from "react";
import { t } from "ttag";

import { useToast } from "metabase/common/hooks";
import type { Card } from "metabase-types/api";

import { clearDraftState } from "../documents.slice";
import { useDocumentsDispatch, useDocumentsStore } from "../redux-utils";
import {
  getCardEmbeds,
  getDocumentCardWithDraftSettings,
  getDocumentsState,
  getHasDraftChanges,
} from "../selectors";

import { useDocumentCardSave } from "./use-document-card-save";

export function useDocumentActions() {
  const dispatch = useDocumentsDispatch();
  const store = useDocumentsStore();
  const [sendToast] = useToast();
  const { saveCard } = useDocumentCardSave();

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
      const cardWithDraftSettings = getDocumentCardWithDraftSettings(
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

        const result = await saveCard({
          card: originalCard,
          modifiedCardData: {
            display: cardWithDraftSettings.display,
            visualization_settings:
              cardWithDraftSettings.visualization_settings,
          },
          editor: editorInstance,
        });

        // If a new card was created, update the embed to point to it
        if (result.card_id !== originalCard.id) {
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
                  id: result.card_id,
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
    [store, dispatch, sendToast, saveCard],
  );

  // Commit all pending changes (used when saving report)
  const commitAllPendingChanges = useCallback(
    async (editorInstance: any, originalCard?: Card) => {
      if (!editorInstance) {
        return;
      }

      const state = store.getState();
      const hasDraftChanges = getHasDraftChanges(state, originalCard);
      const selectedEmbedIndex = getDocumentsState(state).selectedEmbedIndex;

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
