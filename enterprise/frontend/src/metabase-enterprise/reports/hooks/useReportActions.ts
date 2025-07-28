import { useCallback } from "react";
import { t } from "ttag";

import { useToast } from "metabase/common/hooks";
import { utf8_to_b64url } from "metabase/lib/encoding";
import { useDispatch, useSelector, useStore } from "metabase/lib/redux";
import { useCreateReportSnapshotMutation } from "metabase-enterprise/api";

import type { CardEmbedRef } from "../components/Editor/types";
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
  const dispatch = useDispatch();
  const store = useStore();
  const cardEmbeds = useSelector(getCardEmbeds);
  const [createReportSnapshot] = useCreateReportSnapshotMutation();
  const [sendToast] = useToast();

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

      if (cardWithDraftSettings.id.toString().includes("static")) {
        const { doc } = editorInstance.state;
        const tr = editorInstance.state.tr;

        doc.descendants((node: any, pos: number) => {
          if (node.type.name === "cardStatic" && node.attrs.id === embed.id) {
            const display = cardWithDraftSettings.display;
            const viz = utf8_to_b64url(
              JSON.stringify(cardWithDraftSettings.visualization_settings),
            );

            const newAttrs = {
              ...node.attrs,
              display,
              viz,
            };
            tr.setNodeMarkup(pos, undefined, newAttrs);
            return false;
          }
        });

        if (tr.docChanged) {
          editorInstance.view.dispatch(tr);
        }
        dispatch(clearDraftState());
      } else {
        try {
          const { id, created_at, updated_at, ...cardWithoutExcluded } =
            cardWithDraftSettings;
          const result = await createReportSnapshot({
            ...cardWithoutExcluded,
            name: cardWithDraftSettings.name,
          }).unwrap();

          dispatch(clearDraftState());
          const { doc } = editorInstance.state;
          const tr = editorInstance.state.tr;

          // Only update the specific embed at this index
          let nodeCount = 0;
          let updated = false;
          doc.descendants((node: any, pos: number) => {
            if (updated) {
              return false;
            } // Stop if we already updated

            if (node.type.name === "cardEmbed") {
              if (nodeCount === embedIndex) {
                const newAttrs = {
                  ...node.attrs,
                  cardId: result.card_id,
                  snapshotId: result.snapshot_id,
                };
                tr.setNodeMarkup(pos, undefined, newAttrs);
                updated = true;
                return false; // Stop traversing
              }
              nodeCount++;
            }
          });

          if (tr.docChanged) {
            editorInstance.view.dispatch(tr);
          }

          dispatch(
            updateCardEmbeds([{ embedIndex, snapshotId: result.snapshot_id }]),
          );
        } catch (error) {
          console.error("Failed to commit visualization changes:", error);
        }
      }
    },
    [store, createReportSnapshot, dispatch],
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
        const state = store.getState();
        const { doc } = editorInstance.state;
        const tr = editorInstance.state.tr;

        // Create new snapshots for all question embeds in parallel
        const snapshotPromises = cardEmbeds.map(
          async (cardEmbed: CardEmbedRef, index: number) => {
            const card = getReportCard(state, cardEmbed.id);
            if (!card || card.id.toString().includes("static")) {
              return null;
            }

            // Create snapshot using existing card_id to maintain consistency
            const result = await createReportSnapshot({
              card_id: cardEmbed.id,
            }).unwrap();

            return {
              embedIndex: index,
              snapshotId: result.snapshot_id,
            };
          },
        );

        const snapshotResults = await Promise.all(snapshotPromises);
        const validResults = snapshotResults.filter(Boolean);

        // Update specific question embeds in the document by index
        let hasChanges = false;
        validResults.forEach(({ embedIndex, snapshotId }) => {
          const embed = cardEmbeds[embedIndex];
          if (embed) {
            let nodeCount = 0;
            doc.descendants((node: any, pos: number) => {
              if (node.type.name === "cardEmbed") {
                if (nodeCount === embedIndex) {
                  const newAttrs = {
                    ...node.attrs,
                    snapshotId: snapshotId,
                  };
                  tr.setNodeMarkup(pos, undefined, newAttrs);
                  hasChanges = true;
                  return false; // Stop traversing for this specific embed
                }
                nodeCount++;
              }
            });
          }
        });

        // Apply all document changes at once
        if (hasChanges && tr.docChanged) {
          editorInstance.view.dispatch(tr);
        }

        // Update cardEmbeds state with all new snapshot IDs at once
        dispatch(updateCardEmbeds(validResults));

        // Fetch new data for all updated question embeds to refresh the visible report
        validResults.forEach(({ embedIndex, snapshotId }) => {
          const embed = cardEmbeds[embedIndex];
          if (embed) {
            dispatch(
              fetchReportQuestionData({
                cardId: embed.id,
                snapshotId: snapshotId,
              }),
            );
          }
        });

        sendToast({
          message: t`All data refreshed`,
        });
      } catch (error) {
        console.error("Failed to refresh all data:", error);
        sendToast({ message: t`Error refreshing data`, icon: "warning" });
      }
    },
    [cardEmbeds, store, createReportSnapshot, dispatch, sendToast],
  );

  return {
    commitVisualizationChanges,
    commitAllPendingChanges,
    refreshAllData,
  };
}
