import type { Node } from "@tiptap/pm/model";

import {
  RESIZE_NODE_DEFAULT_HEIGHT,
  RESIZE_NODE_MIN_HEIGHT,
} from "../../ResizeNode/ResizeNode";
import {
  type DroppedCardEmbedNodeData,
  extractCardEmbed,
  getCardEmbedDropSide,
  getTargetCardEmbedNode,
} from "../utils";

export const handleCardDropToFlexContainer = (
  payload: DroppedCardEmbedNodeData,
) => {
  const {
    cameFromFlexContainer,
    originalParent,
    dropToParent,
    cardEmbedNode,
    view,
    originalPos,
    event: e,
    dropToParentPos,
  } = payload;

  // Handle dropping within the same FlexContainer - columns reordering
  if (cameFromFlexContainer && originalParent === dropToParent) {
    const targetCardEmbedNode = getTargetCardEmbedNode(e, view);

    if (!targetCardEmbedNode) {
      return;
    }
    if (targetCardEmbedNode === cardEmbedNode) {
      return true; // Prevent dropping on itself
    }

    // Moving within the same FlexContainer - reorder cards
    const tr = view.state.tr;

    // Find the source index
    const sourceIndex = view.state.doc.resolve(originalPos).index();

    // Calculate the intended insertion index based on drop position
    let targetIndex = dropToParent.content.content.indexOf(targetCardEmbedNode);
    const dropSide = getCardEmbedDropSide(e);

    if (dropSide === "left" && targetIndex > 1) {
      targetIndex--;
    } else if (dropSide === "right") {
      targetIndex++;
    }

    // Create array of all children except the dragged one
    const allChildren = [];
    for (let i = 0; i < dropToParent.childCount; i++) {
      if (i !== sourceIndex) {
        const child = dropToParent.child(i);
        const childCardEmbed = extractCardEmbed(child);
        allChildren.push(childCardEmbed ? childCardEmbed : child);
      }
    }

    // Adjust targetIndex for the removed element
    // Since we removed the source element, we need to adjust the target index
    let adjustedTargetIndex;
    if (targetIndex > sourceIndex) {
      // Moving right: the target index shifts down by 1 because we removed an element before it
      adjustedTargetIndex = targetIndex - 1;
    } else {
      // Moving left: target index stays the same
      adjustedTargetIndex = targetIndex;
    }

    // But for moving from left (0) to right of right card, we actually want to append
    // In our case: sourceIndex=0, targetIndex=1, so we want index 1 in the reduced array
    // which means "after the remaining element"
    if (sourceIndex === 0 && targetIndex === 1 && allChildren.length === 1) {
      adjustedTargetIndex = 1; // Insert after the remaining element
    }

    // Insert the dragged element at the correct position
    allChildren.splice(adjustedTargetIndex, 0, cardEmbedNode);

    const newContainer = view.state.schema.nodes.flexContainer.create(
      dropToParent.attrs,
      allChildren,
    );

    const containerPos = dropToParentPos.before();

    tr.replaceWith(
      containerPos,
      containerPos + dropToParent.nodeSize,
      newContainer,
    );

    view.dispatch(tr);

    return true;
  }

  // Handle dropping from one FlexContainer to another FlexContainer
  if (cameFromFlexContainer && originalParent !== dropToParent) {
    const targetFlexContainer = dropToParent;

    // Check if target flexContainer already has 3 or more cards
    if (targetFlexContainer.content.childCount >= 3) {
      return true; // Don't allow dropping if target already has 3 cards
    }

    const targetCardEmbedNode = getTargetCardEmbedNode(e, view);
    if (!targetCardEmbedNode) {
      return;
    }

    // Calculate the intended insertion index based on drop position
    let targetIndex = dropToParent.content.content.indexOf(targetCardEmbedNode);
    const dropSide = getCardEmbedDropSide(e);

    if (dropSide === "left" && targetIndex > 1) {
      targetIndex--;
    } else if (dropSide === "right") {
      targetIndex++;
    }

    // Create transaction
    const tr = view.state.tr;

    // First, remove the card from the source flexContainer
    const sourceFlexContainer = originalParent;
    const sourceIndex = view.state.doc.resolve(originalPos).index();

    const sourceNewChildren = [];
    for (let i = 0; i < sourceFlexContainer.childCount; i++) {
      if (i !== sourceIndex) {
        const child = sourceFlexContainer.child(i);
        sourceNewChildren.push(child);
      }
    }

    // Find source flexContainer position
    let sourceFlexContainerPos: number | null = null;
    view.state.doc.descendants((node, nodePos) => {
      if (node === sourceFlexContainer) {
        sourceFlexContainerPos = nodePos;
        return false;
      }
    });

    if (sourceFlexContainerPos === null) {
      return;
    }

    // Update source flexContainer or remove it if empty
    if (sourceNewChildren.length === 1) {
      // Only one card left in source - unwrap it from flexContainer
      const remainingChild = sourceNewChildren[0];
      const remainingCardEmbed = extractCardEmbed(remainingChild);

      if (remainingCardEmbed) {
        const wrappedRemainingCard = view.state.schema.nodes.resizeNode.create(
          {
            height: RESIZE_NODE_DEFAULT_HEIGHT,
            minHeight: RESIZE_NODE_MIN_HEIGHT,
          },
          [remainingCardEmbed],
        );

        // Replace the source flexContainer with unwrapped card
        const sourceContainerResolvedPos = view.state.doc.resolve(
          sourceFlexContainerPos,
        );
        const sourceContainerParent = sourceContainerResolvedPos.parent;

        if (sourceContainerParent.type.name === "resizeNode") {
          // FlexContainer is wrapped in resizeNode, replace the entire wrapper
          const sourceWrapperPos = sourceContainerResolvedPos.before();
          tr.replaceWith(
            sourceWrapperPos,
            sourceWrapperPos + sourceContainerParent.nodeSize,
            wrappedRemainingCard,
          );
        } else {
          // FlexContainer is not wrapped, just replace it
          tr.replaceWith(
            sourceFlexContainerPos,
            sourceFlexContainerPos + sourceFlexContainer.nodeSize,
            wrappedRemainingCard,
          );
        }
      }
    } else if (sourceNewChildren.length > 1) {
      // Multiple cards left in source, keep as flexContainer
      const newSourceFlexContainer =
        view.state.schema.nodes.flexContainer.create(
          sourceFlexContainer.attrs,
          sourceNewChildren,
        );
      tr.replaceWith(
        sourceFlexContainerPos,
        sourceFlexContainerPos + sourceFlexContainer.nodeSize,
        newSourceFlexContainer,
      );
    } else {
      // No cards left, remove the entire source flexContainer and its wrapper
      const sourceContainerResolvedPos = view.state.doc.resolve(
        sourceFlexContainerPos,
      );
      const sourceContainerParent = sourceContainerResolvedPos.parent;

      if (sourceContainerParent.type.name === "resizeNode") {
        // Remove the entire resizeNode wrapper
        const sourceWrapperPos = sourceContainerResolvedPos.before();
        tr.delete(
          sourceWrapperPos,
          sourceWrapperPos + sourceContainerParent.nodeSize,
        );
      } else {
        // Remove just the flexContainer
        tr.delete(
          sourceFlexContainerPos,
          sourceFlexContainerPos + sourceFlexContainer.nodeSize,
        );
      }
    }

    // Now add the card to the target flexContainer
    const targetChildren: Node[] = [];
    for (let i = 0; i < targetFlexContainer.content.childCount; i++) {
      const child = targetFlexContainer.content.child(i);
      targetChildren.push(child);
    }

    targetChildren.splice(targetIndex, 0, cardEmbedNode.copy());

    // Find target flexContainer position
    let targetFlexContainerPos: number | null = null;
    view.state.doc.descendants((node, nodePos) => {
      if (node === targetFlexContainer) {
        targetFlexContainerPos = nodePos;
        return false;
      }
    });

    if (targetFlexContainerPos === null) {
      return;
    }

    // Replace target flexContainer with updated one
    const newTargetFlexContainer = view.state.schema.nodes.flexContainer.create(
      targetFlexContainer.attrs,
      targetChildren,
    );

    // Since we may have modified the document above, recalculate the target position
    const updatedDoc = tr.doc;
    let updatedTargetPos: number | null = null;
    updatedDoc.descendants((node, nodePos) => {
      if (node === targetFlexContainer) {
        updatedTargetPos = nodePos;
        return false;
      }
    });

    if (updatedTargetPos !== null) {
      tr.replaceWith(
        updatedTargetPos,
        updatedTargetPos + targetFlexContainer.nodeSize,
        newTargetFlexContainer,
      );
    }

    view.dispatch(tr);
    return true;
  }

  // Handle dropping on a cardEmbed that is already in a flexContainer
  if (!cameFromFlexContainer) {
    const flexContainer = dropToParent;

    if (flexContainer.content.childCount === 3) {
      return true; // Don't allow more than 3 cards in flexContainer
    }

    const targetCardEmbedNode = getTargetCardEmbedNode(e, view);
    if (!targetCardEmbedNode) {
      return;
    }

    // Calculate the intended insertion index based on drop position
    let targetIndex = dropToParent.content.content.indexOf(targetCardEmbedNode);
    const dropSide = getCardEmbedDropSide(e);

    if (dropSide === "left" && targetIndex > 1) {
      targetIndex--;
    } else if (dropSide === "right") {
      targetIndex++;
    }

    // Get all current children as cardEmbeds
    const newChildren: Node[] = [];
    for (let i = 0; i < flexContainer.content.childCount; i++) {
      const child = flexContainer.content.child(i);
      newChildren.push(child);
    }

    newChildren.splice(targetIndex, 0, cardEmbedNode.copy());

    // Find the position of the flexContainer (it should be wrapped in resizeNode)
    let flexContainerPos: number | null = null;

    view.state.doc.descendants((node, nodePos) => {
      if (node === flexContainer) {
        flexContainerPos = nodePos;
        return false;
      }
    });

    if (flexContainerPos === null) {
      return;
    }

    // Create transaction
    const tr = view.state.tr;

    // First, replace the flexContainer with the new one containing the inserted card
    const newFlexContainer = view.state.schema.nodes.flexContainer.create(
      flexContainer.attrs,
      newChildren,
    );

    tr.replaceWith(
      flexContainerPos,
      flexContainerPos + flexContainer.nodeSize,
      newFlexContainer,
    );

    // Now remove the dropped node from its original position
    // We need to find it again in the updated document
    const nodeToRemove =
      originalParent.type.name === "resizeNode"
        ? originalParent
        : cardEmbedNode;

    const updatedDoc = tr.doc;
    let nodeFound = false;
    updatedDoc.descendants((node, nodePos) => {
      if (node === nodeToRemove && !nodeFound) {
        tr.delete(nodePos, nodePos + node.nodeSize);
        nodeFound = true;
        return false;
      }
    });

    view.dispatch(tr);
    return true;
  }

  return false;
};
