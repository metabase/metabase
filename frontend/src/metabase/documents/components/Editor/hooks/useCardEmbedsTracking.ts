import type { Editor as TiptapEditor } from "@tiptap/react";
import { useEffect } from "react";

import type { CardEmbedRef } from "metabase-types/store/documents";

/**
 * Extracts all question references from the editor document.
 *
 * This function traverses the entire document tree and collects references to
 * question embeds.
 *
 * @param editor - The Tiptap editor instance
 * @returns Array of question embed references found in the document
 */
const extractCardEmbeds = (editor: TiptapEditor): CardEmbedRef[] => {
  const refs: CardEmbedRef[] = [];

  editor.state.doc.descendants((node: any) => {
    // Handle regular question embeds
    if (node.type.name === "cardEmbed") {
      refs.push({
        id: node.attrs.id,
        name: node.attrs.name,
      });
    }
  });

  return refs;
};

/**
 * Hook that tracks all question references in the Tiptap editor document.
 *
 * This hook monitors the editor content and maintains an up-to-date list of all
 * question embeds. It automatically updates whenever the document changes and
 * notifies the parent component through the provided callback.
 *
 * Features:
 * - Tracks question embeds
 * - Updates on every document change
 *
 * @param editor - The Tiptap editor instance
 * @param onCardEmbedsChange - Callback function that receives the current list of question references
 */
export const useCardEmbedsTracking = (
  editor: TiptapEditor | null,
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
      const refs = extractCardEmbeds(editor);
      onCardEmbedsChange(refs);
    };

    // Listen for document updates
    editor.on("update", updateCardEmbeds);

    // Cleanup
    return () => {
      editor.off("update", updateCardEmbeds);
    };
  }, [editor, onCardEmbedsChange]);
};
