import type { Node } from "@tiptap/pm/model";

import {
  RESIZE_NODE_DEFAULT_HEIGHT,
  RESIZE_NODE_MIN_HEIGHT,
} from "../../ResizeNode/ResizeNode";
import {
  type DroppedCardEmbedNodeData,
  extractContainerSingleCardNode,
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
    draggedNode,
    view,
    originalPos,
    event: e,
  } = payload;

  // Handle dropping within the same FlexContainer - columns reordering
  if (cameFromFlexContainer && originalParent === dropToParent) {
    const targetNode = getTargetCardEmbedNode(e, view);

    if (!targetNode) {
      return;
    }
    if (targetNode === draggedNode) {
      return true; // Prevent dropping on itself
    }

    // Moving within the same FlexContainer - reorder items
    const tr = view.state.tr;

    // Find the source index
    const sourceIndex = view.state.doc.resolve(originalPos).index();

    // Calculate the intended insertion index based on drop position
    let targetIndex = dropToParent.content.content.indexOf(targetNode);
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
        const extractedChild = extractContainerSingleCardNode(child);
        allChildren.push(extractedChild ? extractedChild : child);
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
    allChildren.splice(adjustedTargetIndex, 0, draggedNode);

    // Preserve column widths by reordering them to match the new card positions
    const currentColumnWidths = dropToParent.attrs.columnWidths;
    let newColumnWidths = currentColumnWidths;
    if (
      currentColumnWidths &&
      currentColumnWidths.length === dropToParent.childCount
    ) {
      // Create array of widths excluding the source column width
      const allWidths = [];
      for (let i = 0; i < currentColumnWidths.length; i++) {
        if (i !== sourceIndex) {
          allWidths.push(currentColumnWidths[i]);
        }
      }
      // Insert the source column width at the new position
      allWidths.splice(
        adjustedTargetIndex,
        0,
        currentColumnWidths[sourceIndex],
      );
      newColumnWidths = allWidths;
    }

    const newContainer = view.state.schema.nodes.flexContainer.create(
      { ...dropToParent.attrs, columnWidths: newColumnWidths },
      allChildren,
    );

    // Find the actual position of the FlexContainer in the document
    let containerPos: number | null = null;
    view.state.doc.descendants((node, nodePos) => {
      if (node === dropToParent) {
        containerPos = nodePos;
        return false;
      }
    });

    if (containerPos === null) {
      return true; // Safety check
    }

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
    if (draggedNode.type.name === "supportingText") {
      return true;
    }
    const targetFlexContainer = dropToParent;

    // Check if target flexContainer already has 3 or more items
    if (targetFlexContainer.content.childCount >= 3) {
      return true; // Don't allow dropping if target already has 3 items
    }

    const targetNode = getTargetCardEmbedNode(e, view);
    if (!targetNode) {
      return;
    }

    // Calculate the intended insertion index based on drop position
    let targetIndex = dropToParent.content.content.indexOf(targetNode);
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
      const remainingCardEmbed = extractContainerSingleCardNode(remainingChild);

      if (
        remainingCardEmbed &&
        remainingCardEmbed.type.name !== "supportingText"
      ) {
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
      } else {
        tr.deleteRange(
          sourceFlexContainerPos,
          sourceFlexContainerPos + sourceFlexContainer.nodeSize,
        );
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

    // Now add the item to the target flexContainer
    const targetChildren: Node[] = [];
    for (let i = 0; i < targetFlexContainer.content.childCount; i++) {
      const child = targetFlexContainer.content.child(i);
      targetChildren.push(child);
    }

    targetChildren.splice(targetIndex, 0, draggedNode.copy());

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

  // Handle dropping on an item that is already in a flexContainer
  if (!cameFromFlexContainer) {
    const flexContainer = dropToParent;

    if (flexContainer.content.childCount === 3) {
      return true; // Don't allow more than 3 items in flexContainer
    }

    const targetNode = getTargetCardEmbedNode(e, view);
    if (!targetNode) {
      return;
    }

    // Calculate the intended insertion index based on drop position
    let targetIndex = dropToParent.content.content.indexOf(targetNode);
    const dropSide = getCardEmbedDropSide(e);

    if (dropSide === "left" && targetIndex > 1) {
      targetIndex--;
    } else if (dropSide === "right") {
      targetIndex++;
    }

    // Get all current children
    const newChildren: Node[] = [];
    for (let i = 0; i < flexContainer.content.childCount; i++) {
      const child = flexContainer.content.child(i);
      newChildren.push(child);
    }

    newChildren.splice(targetIndex, 0, draggedNode.copy());

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
      originalParent.type.name === "resizeNode" ? originalParent : draggedNode;

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
