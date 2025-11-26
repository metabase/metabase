import type { Node, ResolvedPos, Slice } from "@tiptap/pm/model";
import type { EditorView } from "@tiptap/pm/view";

// Helper function to extract cardEmbed or supportingText from resizeNode wrapper
export const extractContainerSingleCardNode = (node: Node): Node | null => {
  if (node.type.name === "cardEmbed" || node.type.name === "supportingText") {
    return node;
  }
  if (node.type.name === "resizeNode" && node.content.childCount === 1) {
    const child = node.content.child(0);
    if (
      child.type.name === "cardEmbed" ||
      child.type.name === "supportingText"
    ) {
      return child;
    }
  }
  return null;
};

export const getCardEmbedDropSide = (e: DragEvent): "left" | "right" | null => {
  const targetCardEmbedDOM =
    e.target instanceof Element ? e.target.closest(".node-cardEmbed") : null;
  const targetSupportingTextDOM =
    e.target instanceof Element
      ? e.target.closest(".node-supportingText")
      : null;
  const targetDOM = targetCardEmbedDOM || targetSupportingTextDOM;

  if (targetDOM) {
    const rect = targetDOM.getBoundingClientRect();
    const xPct = (e.clientX - rect.left) / rect.width;

    return xPct >= 0.5 ? "right" : "left";
  }

  return null;
};

export const getTargetCardEmbedNode = (e: DragEvent, view: EditorView) => {
  const targetCardEmbedDOM =
    e.target instanceof Element ? e.target.closest(".node-cardEmbed") : null;
  const targetSupportingTextDOM =
    e.target instanceof Element
      ? e.target.closest(".node-supportingText")
      : null;
  const targetDOM = targetCardEmbedDOM || targetSupportingTextDOM;

  if (targetDOM) {
    const pos = view.posAtDOM(targetDOM, 0);
    const resolvedPos = view.state.doc.resolve(pos);

    // For supportingText, posAtDOM returns a position inside the node (pointing to content)
    // so we need to check the parent. For cardEmbed (atom), it returns the position before the node.
    if (targetSupportingTextDOM) {
      // Check if the parent is supportingText
      if (resolvedPos.parent.type.name === "supportingText") {
        return resolvedPos.parent;
      }
      // Otherwise search up the tree
      for (let d = resolvedPos.depth; d > 0; d--) {
        const node = resolvedPos.node(d);
        if (node.type.name === "supportingText") {
          return node;
        }
      }
    } else if (targetCardEmbedDOM) {
      // For cardEmbed, nodeAt works as expected
      const targetNode = view.state.doc.nodeAt(pos);
      if (targetNode) {
        return extractContainerSingleCardNode(targetNode);
      }
    }
  }

  return null;
};

export interface DroppedCardEmbedNodeData {
  draggedNode: Node;
  originalPos: number;
  originalParent: Node;
  cameFromFlexContainer: boolean;
  dropPos: number;
  dropToParentPos: ResolvedPos;
  dropToParent: Node;
  event: DragEvent;
  slice: Slice;
  moved: boolean;
  view: EditorView;
}

export const getDroppedCardEmbedNodeData = (
  view: EditorView,
  event: DragEvent,
  slice: Slice,
  moved: boolean,
): DroppedCardEmbedNodeData | undefined => {
  // Check if we're moving a cardEmbed or supportingText node
  if (slice.content.childCount === 1) {
    const droppedNode = slice.content.child(0);
    const draggedNode = extractContainerSingleCardNode(droppedNode);

    // Dropping a "cardEmbed" or "supportingText" node
    if (draggedNode && moved) {
      const nodeParentResult = findNodeParentAndPos(view, draggedNode);

      if (!nodeParentResult) {
        return;
      }

      const { parent: originalParent, parentPos: originalPos } =
        nodeParentResult;

      const cameFromFlexContainer = originalParent
        ? (originalParent as Node).type.name === "flexContainer"
        : false;

      // Find the position where the node was dropped
      const coords = view.posAtCoords({
        left: event.clientX,
        top: event.clientY,
      });

      if (coords) {
        const dropPos = coords.pos;
        const dropToParentPos = view.state.doc.resolve(dropPos);
        const dropToParent = dropToParentPos.parent;

        return {
          draggedNode,
          originalPos,
          originalParent,
          cameFromFlexContainer,
          dropPos,
          dropToParentPos,
          dropToParent,
          event,
          slice,
          view,
          moved,
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

    if (
      extractContainerSingleCardNode(node) === nodeToFind &&
      node !== nodeToFind
    ) {
      parentPos = pos;
      parent = node;
      return false;
    }
  });

  if (parentPos !== null && parent !== null) {
    return { parentPos, parent };
  }

  return null;
};

// Traverses the document and unwraps any flexContainer nodes that only have 1 child
export const cleanupFlexContainerNodes = (view: EditorView) => {
  view.state.doc.descendants((node, pos) => {
    if (node.type.name === "flexContainer" && node.childCount === 1) {
      const child = node.firstChild;
      if (child) {
        view.dispatch(
          child.type.name === "supportingText"
            ? view.state.tr.deleteRange(pos, pos + node.nodeSize)
            : view.state.tr.replaceWith(pos, pos + node.nodeSize, child),
        );
      }
    }
  });
};
