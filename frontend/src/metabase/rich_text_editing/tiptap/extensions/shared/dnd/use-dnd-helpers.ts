import type { NodeViewProps } from "@tiptap/react";
import { useCallback, useRef, useState } from "react";
import { useMount, useUnmount } from "react-use";

const DRAG_LEAVE_TIMEOUT = 300;

export const useDndHelpers = ({
  editor,
  node,
  getPos,
}: {
  editor: NodeViewProps["editor"];
  node: NodeViewProps["node"];
  getPos: NodeViewProps["getPos"];
}) => {
  const [dragState, setDragState] = useState<{
    isDraggedOver: boolean;
    side: "left" | "right" | null;
  }>({ isDraggedOver: false, side: null });
  const draggedOverTimeoutRef = useRef<number | undefined>();
  const dragElRef = useRef<HTMLDivElement | null>(null);
  const isMountedRef = useRef(false);

  const isBeingDragged = editor.view.draggingNode === node;

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();

      const draggingNode = editor.view.draggingNode;
      if (
        draggingNode &&
        (draggingNode.type.name === "cardEmbed" ||
          draggingNode.type.name === "supportingText") &&
        dragElRef.current
      ) {
        const pos = getPos();
        if (pos) {
          const resolvedPos = editor.state.doc.resolve(pos);
          const { parent } = resolvedPos;

          // For simplicity's sake, don't allow dragging supportingText from one group to another
          if (draggingNode.type.name === "supportingText") {
            if (
              parent.type.name === "flexContainer" ||
              parent.type.name === "resizeNode"
            ) {
              if (!parent.content.content.includes(draggingNode)) {
                setDragState({ isDraggedOver: false, side: null });
                return;
              }
            }
          }

          // Check if this cardEmbed is in a flexContainer that already has 3 children
          if (
            parent.type.name === "flexContainer" &&
            parent.content.childCount >= 3
          ) {
            let containsDraggedNode = false;

            for (let i = 0; i < parent.content.childCount; i++) {
              const child = parent.child(i);
              containsDraggedNode =
                containsDraggedNode || child === draggingNode;
            }

            if (!containsDraggedNode) {
              // Don't show drop zones if flexContainer is already at max capacity
              setDragState({ isDraggedOver: false, side: null });
              return;
            }
          }
        }

        const rect = dragElRef.current?.getBoundingClientRect();
        const relativeX = e.clientX - rect.left;
        const nodeWidth = rect.width;

        // Determine which side based on cursor position
        let side: "left" | "right" | null = null;
        if (relativeX < nodeWidth * 0.5) {
          side = "left";
        } else if (relativeX >= nodeWidth * 0.5) {
          side = "right";
        }

        setDragState({ isDraggedOver: true, side });

        window.clearTimeout(draggedOverTimeoutRef.current);

        draggedOverTimeoutRef.current = window.setTimeout(() => {
          if (isMountedRef.current) {
            setDragState({ isDraggedOver: false, side: null });
          }
        }, DRAG_LEAVE_TIMEOUT);
      }
    },
    [editor.view.draggingNode, getPos, editor.state.doc],
  );

  useMount(() => {
    isMountedRef.current = true;
  });

  useUnmount(() => {
    isMountedRef.current = false;
  });

  return {
    isBeingDragged,
    dragState,
    setDragState,
    handleDragOver,
    dragElRef,
  };
};
