import type { Node, ResolvedPos, Slice } from "@tiptap/pm/model";
import type { EditorView } from "@tiptap/pm/view";

// Helper function to extract cardEmbed from resizeNode wrapper
export const extractCardEmbed = (node: Node): Node | null => {
  if (node.type.name === "cardEmbed") {
    return node;
  }
  if (node.type.name === "resizeNode" && node.content.childCount === 1) {
    const child = node.content.child(0);
    if (child.type.name === "cardEmbed") {
      return child;
    }
  }
  return null;
};

export const getCardEmbedDropSide = (e: DragEvent): "left" | "right" | null => {
  const targetCardEmbedDOM =
    e.target instanceof Element ? e.target.closest(".node-cardEmbed") : null;
  if (targetCardEmbedDOM) {
    const rect = targetCardEmbedDOM.getBoundingClientRect();
    const xPct = (e.clientX - rect.left) / rect.width;

    return xPct >= 0.5 ? "right" : "left";
  }

  return null;
};

export const getTargetCardEmbedNode = (e: DragEvent, view: EditorView) => {
  const targetCardEmbedDOM =
    e.target instanceof Element ? e.target.closest(".node-cardEmbed") : null;

  if (targetCardEmbedDOM) {
    const pos = view.posAtDOM(targetCardEmbedDOM, 0);
    const targetCardEmbed = view.state.doc.nodeAt(pos);

    if (targetCardEmbed) {
      return extractCardEmbed(targetCardEmbed);
    }
  }

  return null;
};

export const getDroppedCardEmbedNodeData = (
  view: EditorView,
  event: DragEvent,
  slice: Slice,
  moved: boolean,
):
  | {
      cardEmbedNode: Node;
      originalPos: number;
      originalParent: Node;
      cameFromFlexContainer: boolean;
      dropPos: number;
      dropToParentPos: ResolvedPos;
      dropToParent: Node;
    }
  | undefined => {
  // Check if we're moving a cardEmbed node
  if (slice.content.childCount === 1) {
    const droppedNode = slice.content.child(0);
    const cardEmbedNode = extractCardEmbed(droppedNode);

    // Dropping a "cardEmbed" node
    if (cardEmbedNode && moved) {
      const nodeParentResult = findNodeParentAndPos(view, cardEmbedNode);

      if (!nodeParentResult) {
        return;
      }

      const { parent: originalParent, parentPos: originalPos } =
        nodeParentResult;

      const cameFromFlexContainer = originalParent
        ? (originalParent as Node).type.name === "flexContainer"
        : false;

      // Find the position where the card was dropped
      const coords = view.posAtCoords({
        left: event.clientX,
        top: event.clientY,
      });

      if (coords) {
        const dropPos = coords.pos;
        const dropToParentPos = view.state.doc.resolve(dropPos);
        const dropToParent = dropToParentPos.parent;

        return {
          cardEmbedNode,
          originalPos,
          originalParent,
          cameFromFlexContainer,
          dropPos,
          dropToParentPos,
          dropToParent,
        };
      }
    }
  }
};

export const findNodeParentAndPos = (
  view: EditorView,
  nodeToFind: Node,
): { parentPos: number; parent: Node } | null => {
  let parentPos: number | null = null;
  let parent: Node | null = null;

  view.state.doc.descendants((node, pos, nodeParent) => {
    if (node === nodeToFind) {
      parentPos = pos;
      parent = nodeParent;
      return false;
    }

    if (extractCardEmbed(node) === nodeToFind && node !== nodeToFind) {
      parentPos = pos;
      parent = node;
      return false;
    }
  });

  if (parentPos && parent) {
    return { parentPos, parent };
  }

  return null;
};
