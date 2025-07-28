import type { Editor as TiptapEditor } from "@tiptap/react";
import { useEffect } from "react";
import _ from "underscore";

import { b64hash_to_utf8 } from "metabase/lib/encoding";
import type { DispatchFn } from "metabase/lib/redux";
import { createMockCard, createMockDataset } from "metabase-types/api/mocks";

import { fetchReportCard, fetchReportSnapshot } from "../../../reports.slice";
import type { CardEmbedRef } from "../types";

/**
 * Extracts all question references from the editor document.
 *
 * This function traverses the entire document tree and collects references to:
 * - Question embeds (dynamic questions)
 * - Question static nodes (static snapshots)
 *
 * For static questions, it also handles ID assignment and dispatches necessary
 * actions to populate the Redux store with mock data.
 *
 * @param editor - The Tiptap editor instance
 * @param dispatch - Redux dispatch function for handling static question data
 * @returns Array of question embed references found in the document
 */
const extractCardEmbeds = (
  editor: TiptapEditor,
  dispatch: DispatchFn, // FIXME: detach from redux
): CardEmbedRef[] => {
  const refs: CardEmbedRef[] = [];

  editor.state.doc.descendants((node: any) => {
    // Handle regular question embeds
    if (node.type.name === "cardEmbed") {
      refs.push({
        id: node.attrs.cardId,
        name: node.attrs.customName || node.attrs.questionName,
        snapshotId: node.attrs.snapshotId,
      });
    }

    // Handle static question nodes
    if (node.type.name === "cardStatic") {
      // Assign unique IDs to static questions if they don't have them
      // This ensures consistent tracking across editor updates
      if (!node.attrs.id) {
        node.attrs.id = `static-${_.uniqueId()}`;
        node.attrs.snapshotId = `static-${_.uniqueId()}`;

        const { questionName, display, id, snapshotId } = node.attrs;

        // Decode base64-encoded series data and visualization settings
        const seriesData = JSON.parse(b64hash_to_utf8(node.attrs.series));
        const viz = JSON.parse(b64hash_to_utf8(node.attrs.viz));

        // Dispatch action to create mock card data for the static question
        dispatch({
          type: fetchReportCard.fulfilled.toString(),
          payload: createMockCard({
            name: questionName,
            display,
            visualization_settings: viz,
            id,
          }),
        });

        // Dispatch action to create mock snapshot data
        dispatch({
          type: fetchReportSnapshot.fulfilled.toString(),
          payload: createMockDataset({
            data: seriesData,
          }),
          meta: {
            arg: snapshotId,
          },
        });
      }

      // Add the static question to refs
      const { questionName, id, snapshotId } = node.attrs;
      refs.push({
        id: id,
        name: questionName,
        snapshotId,
      });
    }
  });

  return refs;
};

/**
 * Hook that tracks all question references in the Tiptap editor document.
 *
 * This hook monitors the editor content and maintains an up-to-date list of all
 * question references (both dynamic embeds and static snapshots). It automatically
 * updates whenever the document changes and notifies the parent component through
 * the provided callback.
 *
 * Features:
 * - Tracks both question embeds and static questions
 * - Automatically assigns IDs to static questions
 * - Dispatches Redux actions to populate store with static question data
 * - Updates on every document change
 *
 * @param editor - The Tiptap editor instance
 * @param dispatch - Redux dispatch function for handling static question data
 * @param onCardEmbedsChange - Callback function that receives the current list of question references
 */
export const useCardEmbedsTracking = (
  editor: TiptapEditor | null,
  dispatch: DispatchFn,
  onCardEmbedsChange: ((refs: CardEmbedRef[]) => void) | undefined,
): void => {
  useEffect(() => {
    if (!editor || !onCardEmbedsChange) {
      return;
    }

    /**
     * Updates the question references by scanning the entire document.
     * Called initially and on every document update.
     */
    const updateCardEmbeds = () => {
      const refs = extractCardEmbeds(editor, dispatch);
      onCardEmbedsChange(refs);
    };

    // Perform initial scan
    updateCardEmbeds();

    // Listen for document updates
    editor.on("update", updateCardEmbeds);

    // Cleanup
    return () => {
      editor.off("update", updateCardEmbeds);
    };
  }, [editor, onCardEmbedsChange, dispatch]);
};
