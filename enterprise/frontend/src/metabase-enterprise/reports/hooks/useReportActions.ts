import { useCallback } from "react";
import { t } from "ttag";

import { useToast } from "metabase/common/hooks";
import { useDispatch, useSelector, useStore } from "metabase/lib/redux";
import { useCreateReportSnapshotMutation } from "metabase-enterprise/api";

import {
  clearModifiedVisualizationSettings,
  fetchReportQuestionData,
  updateQuestionRefs,
} from "../reports.slice";
import {
  getHasModifiedVisualizationSettings,
  getQuestionRefs,
  getReportCard,
} from "../selectors";

export function useReportActions() {
  const dispatch = useDispatch();
  const store = useStore();
  const questionRefs = useSelector(getQuestionRefs);
  const [createReportSnapshot] = useCreateReportSnapshotMutation();
  const [sendToast] = useToast();

  const commitVisualizationChanges = useCallback(
    async (cardId: number, editorInstance: any) => {
      const state = store.getState();
      const card = getReportCard(state, cardId);
      const hasModified = getHasModifiedVisualizationSettings(state, cardId);

      if (!card || !hasModified || !editorInstance) {
        return;
      }

      try {
        const { id, created_at, updated_at, ...cardWithoutExcluded } = card;
        const result = await createReportSnapshot({
          ...cardWithoutExcluded,
          name: card.name,
        }).unwrap();

        dispatch(clearModifiedVisualizationSettings(cardId));
        const { doc } = editorInstance.state;
        const tr = editorInstance.state.tr;

        doc.descendants((node: any, pos: number) => {
          if (
            node.type.name === "questionEmbed" &&
            node.attrs.questionId === cardId
          ) {
            const newAttrs = {
              ...node.attrs,
              questionId: result.card_id,
              snapshotId: result.snapshot_id,
            };
            tr.setNodeMarkup(pos, undefined, newAttrs);
            return false;
          }
        });

        if (tr.docChanged) {
          editorInstance.view.dispatch(tr);
        }

        dispatch(
          updateQuestionRefs([
            { questionId: cardId, snapshotId: result.snapshot_id },
          ]),
        );
      } catch (error) {
        console.error("Failed to commit visualization changes:", error);
      }
    },
    [store, createReportSnapshot, dispatch],
  );

  const refreshAllData = useCallback(
    async (editorInstance: any) => {
      if (!editorInstance || questionRefs.length === 0) {
        return;
      }

      try {
        const state = store.getState();
        const { doc } = editorInstance.state;
        const tr = editorInstance.state.tr;

        // Create new snapshots for all question embeds in parallel
        const snapshotPromises = questionRefs.map(async (questionRef) => {
          const card = getReportCard(state, questionRef.id);
          if (!card) {
            return null;
          }

          // Create snapshot using existing card_id to maintain consistency
          const result = await createReportSnapshot({
            card_id: questionRef.id,
          }).unwrap();

          return {
            questionId: questionRef.id,
            snapshotId: result.snapshot_id,
          };
        });

        const snapshotResults = await Promise.all(snapshotPromises);
        const validResults = snapshotResults.filter(Boolean);

        // Update all question embeds in the document at once
        let hasChanges = false;
        validResults.forEach(({ questionId, snapshotId }) => {
          doc.descendants((node: any, pos: number) => {
            if (
              node.type.name === "questionEmbed" &&
              node.attrs.questionId === questionId
            ) {
              const newAttrs = {
                ...node.attrs,
                snapshotId: snapshotId,
              };
              tr.setNodeMarkup(pos, undefined, newAttrs);
              hasChanges = true;
            }
          });
        });

        // Apply all document changes at once
        if (hasChanges && tr.docChanged) {
          editorInstance.view.dispatch(tr);
        }

        // Update questionRefs state with all new snapshot IDs at once
        dispatch(updateQuestionRefs(validResults));

        // Fetch new data for all updated question embeds to refresh the visible report
        validResults.forEach(({ questionId, snapshotId }) => {
          dispatch(
            fetchReportQuestionData({
              cardId: questionId,
              snapshotId: snapshotId,
            }),
          );
        });

        sendToast({
          message: t`All data refreshed`,
        });
      } catch (error) {
        console.error("Failed to refresh all data:", error);
        sendToast({ message: t`Error refreshing data`, icon: "warning" });
      }
    },
    [questionRefs, store, createReportSnapshot, dispatch, sendToast],
  );

  return {
    commitVisualizationChanges,
    refreshAllData,
  };
}
