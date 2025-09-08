import type { Editor as TiptapEditor } from "@tiptap/react";
import { useCallback, useRef } from "react";

/**
 * Custom hook to manage ResizeNode drop cursor functionality
 * Integrates with the existing DragHandle extension to provide visual feedback
 */
export const useResizeNodeDropCursor = (editor: TiptapEditor | null) => {
  const dragStateRef = useRef<{
    isDragging: boolean;
    draggedNodeType: string | null;
  }>({
    isDragging: false,
    draggedNodeType: null,
  });

  /**
   * Handle drag start - initialize drop cursor tracking
   */
  const handleElementDragStart = useCallback(
    (event: DragEvent) => {
      if (!editor) {
        return;
      }

      // Get the dragged node from the editor's current selection
      const { selection } = editor.state;
      const { $from } = selection;

      // Find the node being dragged by walking up from the selection
      let draggedNode = null;
      for (let depth = $from.depth; depth >= 0; depth--) {
        const node = $from.node(depth);
        if (node.type.name === "resizeNode") {
          draggedNode = node;
          break;
        }
      }

      console.log("handleElementDragStart", { draggedNode });

      if (draggedNode?.type.name === "resizeNode") {
        dragStateRef.current = {
          isDragging: true,
          draggedNodeType: "resizeNode",
        };

        console.log("handleElementDragStart --- setRef");

        // Add a class to the body to indicate ResizeNode dragging
        document.body.classList.add("resize-node-dragging");
      }
    },
    [editor],
  );

  /**
   * Handle drag end - cleanup drop cursor state
   */
  const handleElementDragEnd = useCallback(
    (event: DragEvent) => {
      if (!editor) {
        return;
      }

      // Always hide the drop cursor and reset state
      editor.commands.hideResizeNodeDropCursor();

      dragStateRef.current = {
        isDragging: false,
        draggedNodeType: null,
      };

      // Remove dragging class
      document.body.classList.remove("resize-node-dragging");
    },
    [editor],
  );

  /**
   * Handle mouse move during drag - show drop cursor at appropriate positions
   */
  const handleDragMove = useCallback(
    (event: MouseEvent) => {
      console.log("handleDragMove --- useCallback");

      if (
        !editor ||
        !dragStateRef.current.isDragging ||
        dragStateRef.current.draggedNodeType !== "resizeNode"
      ) {
        return;
      }

      // Use the extension's storage function to find ResizeNode at coordinates
      const resizeNodeDropCursorExtension =
        editor.extensionManager.extensions.find(
          (ext) => ext.name === "resizeNodeDropCursor",
        );

      if (!resizeNodeDropCursorExtension?.storage?.findResizeNodeAtCoords) {
        return;
      }

      const targetResizeNode =
        resizeNodeDropCursorExtension.storage.findResizeNodeAtCoords(
          editor.view,
          { x: event.clientX, y: event.clientY },
        );

      console.log("handleDragMove ---", { targetResizeNode });

      if (targetResizeNode) {
        // Show drop cursor to the right of the target ResizeNode
        editor.commands.showResizeNodeDropCursor(targetResizeNode.endPos);
      } else {
        // Hide drop cursor if not over a ResizeNode
        editor.commands.hideResizeNodeDropCursor();
      }
    },
    [editor],
  );

  /**
   * Enhanced drag start handler that also sets up mouse move listener
   */
  const enhancedDragStart = useCallback(
    (event: DragEvent) => {
      handleElementDragStart(event);

      // Add mouse move listener for drop cursor positioning
      if (dragStateRef.current.isDragging) {
        console.log("enhancedDragStart --- isDragging");

        document.addEventListener("mousemove", handleDragMove);
      }
    },
    [handleElementDragStart, handleDragMove],
  );

  /**
   * Enhanced drag end handler that also cleans up mouse move listener
   */
  const enhancedDragEnd = useCallback(
    (event: DragEvent) => {
      // Remove mouse move listener
      document.removeEventListener("mousemove", handleDragMove);

      handleElementDragEnd(event);
    },
    [handleElementDragEnd, handleDragMove],
  );

  return {
    handleElementDragStart: enhancedDragStart,
    handleElementDragEnd: enhancedDragEnd,
  };
};
