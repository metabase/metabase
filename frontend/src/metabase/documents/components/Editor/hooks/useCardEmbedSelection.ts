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
  onCardSelect:
    | ((cardId: number | null, embedIndex?: number | null) => void)
    | undefined,
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
      const { doc } = editor.state;

      const nodeAtCursor = doc.nodeAt(selection.from);

      if (nodeAtCursor && nodeAtCursor.type.name === "cardEmbed") {
        // Find which embed index this node corresponds to
        let embedIndex = -1;
        let nodeCount = 0;

        doc.descendants((node, pos) => {
          if (node.type.name === "cardEmbed") {
            if (pos === selection.from) {
              embedIndex = nodeCount;
              return false;
            }
            nodeCount++;
          }
          return true;
        });

        onCardSelect(nodeAtCursor.attrs.id, embedIndex);
      } else {
        onCardSelect(null, null);
      }
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
