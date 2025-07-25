import { useCallback } from "react";
import { t } from "ttag";

import { useToast } from "metabase/common/hooks";
import { utf8_to_b64url } from "metabase/lib/encoding";
import { useDispatch, useSelector, useStore } from "metabase/lib/redux";
import { useCreateReportSnapshotMutation } from "metabase-enterprise/api";

import {
  type QuestionEmbed,
  clearDraftState,
  updateQuestionEmbeds,
} from "../reports.slice";
import {
  getHasDraftChanges,
  getQuestionEmbeds,
  getReportsState,
} from "../selectors";

export function useReportActions() {
  const dispatch = useDispatch();
  const store = useStore();
  const questionEmbeds = useSelector(getQuestionEmbeds);
  const [createReportSnapshot] = useCreateReportSnapshotMutation();
  const [sendToast] = useToast();

  const commitVisualizationChanges = useCallback(
    async (embedIndex: number, editorInstance: any) => {
      const state = store.getState();
      const hasDraftChanges = getHasDraftChanges(state);
      const questionEmbeds = getQuestionEmbeds(state);

      if (
        !hasDraftChanges ||
        !editorInstance ||
        embedIndex < 0 ||
        embedIndex >= questionEmbeds.length
      ) {
        return;
      }

      const embed = questionEmbeds[embedIndex];
      const reportsState = getReportsState(state);
      const draftCard = reportsState.draftCard;

      if (!draftCard) {
        return;
      }

      if (draftCard.id.toString().includes("static")) {
        const { doc } = editorInstance.state;
        const tr = editorInstance.state.tr;

        doc.descendants((node: any, pos: number) => {
          if (
            node.type.name === "questionStatic" &&
            node.attrs.id === embed.id
          ) {
            const display = draftCard.display;
            const viz = utf8_to_b64url(
              JSON.stringify(draftCard.visualization_settings),
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
            draftCard;
          const result = await createReportSnapshot({
            ...cardWithoutExcluded,
            name: draftCard.name,
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

            if (node.type.name === "questionEmbed") {
              if (nodeCount === embedIndex) {
                const newAttrs = {
                  ...node.attrs,
                  questionId: result.card_id,
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
            updateQuestionEmbeds([
              { embedIndex, snapshotId: result.snapshot_id },
            ]),
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
      if (!editorInstance || questionEmbeds.length === 0) {
        return;
      }

      try {
        const { doc } = editorInstance.state;
        const tr = editorInstance.state.tr;

        // Create new snapshots for all question embeds in parallel
        const snapshotPromises = questionEmbeds.map(
          async (questionEmbed: QuestionEmbed, index: number) => {
            // Skip static cards (those with string IDs containing "static")
            if (questionEmbed.id.toString().includes("static")) {
              return null;
            }

            try {
              // Create snapshot using existing card_id to maintain consistency
              const result = await createReportSnapshot({
                card_id: questionEmbed.id,
              }).unwrap();

              return {
                embedIndex: index,
                snapshotId: result.snapshot_id,
              };
            } catch (error) {
              console.error(
                `Failed to refresh data for embed ${index}:`,
                error,
              );
              return null;
            }
          },
        );

        const snapshotResults = await Promise.all(snapshotPromises);
        const validResults = snapshotResults.filter(Boolean);

        // Update specific question embeds in the document by index
        let hasChanges = false;
        validResults.forEach(({ embedIndex, snapshotId }) => {
          const embed = questionEmbeds[embedIndex];
          if (embed) {
            let nodeCount = 0;
            doc.descendants((node: any, pos: number) => {
              if (node.type.name === "questionEmbed") {
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

        // Update questionEmbeds state with all new snapshot IDs at once
        dispatch(updateQuestionEmbeds(validResults));

        sendToast({
          message: t`All data refreshed`,
        });
      } catch (error) {
        console.error("Failed to refresh all data:", error);
        sendToast({ message: t`Error refreshing data`, icon: "warning" });
      }
    },
    [questionEmbeds, createReportSnapshot, dispatch, sendToast],
  );

  return {
    commitVisualizationChanges,
    commitAllPendingChanges,
    refreshAllData,
  };
}
