import type { Editor as TiptapEditor } from "@tiptap/react";
import { useEffect } from "react";

/**
 * Hook that tracks question selection in the Tiptap editor.
 *
 * This hook monitors the editor's selection state and detects when:
 * - A question embed node is directly selected
 * - A question static node is directly selected
 * - The cursor is positioned inside a question embed
 * - The selection is cleared (ESC key or selection outside questions)
 *
 * @param editor - The Tiptap editor instance
 * @param onCardSelect - Callback function that receives the selected question ID or null
 */
export const useCardEmbedSelection = (
  editor: TiptapEditor | null,
  onCardSelect: ((cardId: number | null) => void) | undefined,
): void => {
  useEffect(() => {
    if (!editor || !onCardSelect) {
      return;
    }

    /**
     * Checks the current selection and determines if a question is selected.
     * Handles both direct node selection and cursor position within question embeds.
     */
    const updateSelection = () => {
      const { selection } = editor.state;
      const node = editor.state.doc.nodeAt(selection.from);

      // Check if the node at the cursor position is a question embed
      if (node && node.type.name === "cardEmbed") {
        onCardSelect(node.attrs.id);
        return;
      }

      // If not directly on a question node, check if selection is inside a question embed
      let foundCardId: number | null = null;

      editor.state.doc.nodesBetween(selection.from, selection.to, (node) => {
        if (node.type.name === "cardEmbed") {
          foundCardId = node.attrs.id;
          // Return false to stop iteration once we find a question embed
          return false;
        }
        // Continue searching
        return true;
      });

      onCardSelect(foundCardId);
    };

    // Initial selection check
    updateSelection();

    // Listen for selection changes
    editor.on("selectionUpdate", updateSelection);

    // Cleanup
    return () => {
      editor.off("selectionUpdate", updateSelection);
    };
  }, [editor, onCardSelect]);
};
