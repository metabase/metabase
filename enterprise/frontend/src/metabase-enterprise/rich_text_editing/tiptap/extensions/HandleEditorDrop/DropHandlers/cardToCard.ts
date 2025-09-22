import type { Node } from "@tiptap/pm/model";

import {
  RESIZE_NODE_DEFAULT_HEIGHT,
  RESIZE_NODE_MIN_HEIGHT,
} from "../../ResizeNode/ResizeNode";
import { type DroppedCardEmbedNodeData, getCardEmbedDropSide } from "../utils";

export const handleCardDropOnCard = (
  payload: DroppedCardEmbedNodeData,
  targetCardEmbed: Node,
) => {
  const {
    cardEmbedNode,
    view,
    event: e,
    originalParent,
    originalPos,
    dropToParent,
    dropToParentPos,
    cameFromFlexContainer,
  } = payload;

  if (targetCardEmbed === cardEmbedNode) {
    return true; // Prevent dropping on itself
  }

  const dropSide = getCardEmbedDropSide(e);
  // Create new FlexContainer when dropping on a standalone CardEmbed
  const children =
    dropSide === "left"
      ? [cardEmbedNode.copy(), targetCardEmbed.copy()]
      : [targetCardEmbed.copy(), cardEmbedNode.copy()];

  const flexContainer = view.state.schema.nodes.flexContainer.create(
    {},
    children,
  );

  // Wrap the flexContainer in a resizeNode
  const wrapper = view.state.schema.nodes.resizeNode.create(
    {
      height: RESIZE_NODE_DEFAULT_HEIGHT,
      minHeight: RESIZE_NODE_MIN_HEIGHT,
    },
    [flexContainer],
  );

  // Determine what to replace - if target is wrapped in resizeNode, replace the wrapper
  let replacePos = originalPos;
  let replaceSize = cardEmbedNode.nodeSize;
  if (dropToParent.type.name === "resizeNode") {
    // Target is wrapped, replace the entire resizeNode
    replacePos = dropToParentPos.before();
    replaceSize = dropToParent.nodeSize;
  }

  // Create a single transaction for both operations to avoid position shifting
  const tr = view.state.tr;

  // First, find and remove the dropped node from its original position
  const nodeToRemove =
    originalParent.type.name === "resizeNode" ? originalParent : cardEmbedNode;
  let removalHandled = false;
  let removePos: number | null = null;
  view.state.doc.descendants((node, nodePos) => {
    if (node === nodeToRemove && !removalHandled) {
      tr.delete(nodePos, nodePos + node.nodeSize);
      removalHandled = true;
      removePos = nodePos;
      return false;
    }
  });

  // Then replace the target with the new FlexContainer
  // Need to recalculate positions after the removal
  let adjustedReplacePos = replacePos;
  if (removalHandled && removePos !== null && removePos < replacePos) {
    // If we removed something before the replace position, adjust it
    const removedSize = nodeToRemove.nodeSize;
    adjustedReplacePos = replacePos - removedSize;
  }

  tr.replaceWith(adjustedReplacePos, adjustedReplacePos + replaceSize, wrapper);

  if (cameFromFlexContainer) {
    // TODO: check if we need to clean up the original flexContainer if it had only 1 card left
  }

  view.dispatch(tr);
  return true;
};
