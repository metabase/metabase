import { Fragment, type Node as ProseMirrorNode } from "@tiptap/pm/model";

import {
  RESIZE_NODE_DEFAULT_HEIGHT,
  RESIZE_NODE_MIN_HEIGHT,
} from "../../ResizeNode/ResizeNode";
import {
  type DroppedCardEmbedNodeData,
  extractContainerSingleCardNode,
} from "../utils";

export const handleCardDropOnDocument = (payload: DroppedCardEmbedNodeData) => {
  const {
    originalParent,
    originalPos,
    view,
    cameFromFlexContainer,
    draggedNode,
    dropPos,
  } = payload;
  let diffSize = 0;
  const tr = view.state.tr;

  /**
   * Works like `tr.replaceWith` except keeps track of how much is added/deleted so previously calculated positions can be adjusted
   */
  const replaceWith = (
    from: number,
    to: number,
    content: Fragment | ProseMirrorNode,
  ) => {
    const oldContentSize = to - from;
    const newContentSize =
      content instanceof Fragment ? content.size : content.nodeSize;
    diffSize += newContentSize - oldContentSize;
    return tr.replaceWith(from, to, content);
  };

  if (cameFromFlexContainer) {
    // Handle moving from FlexContainer to document
    if (originalPos !== null && originalParent?.type.name === "flexContainer") {
      // First, update/remove from FlexContainer (do this BEFORE insertion to avoid position shifting)
      const flexContainerPos = view.state.doc.resolve(originalPos).before();
      const flexContainer = originalParent;

      // Remove the card from the FlexContainer
      const newChildren = [];
      const sourceIndex = view.state.doc.resolve(originalPos).index();

      for (let i = 0; i < flexContainer.childCount; i++) {
        if (i !== sourceIndex) {
          const child = flexContainer.child(i);
          newChildren.push(child);
        }
      }

      if (newChildren.length === 1) {
        // If only one card left, unwrap it from FlexContainer and wrap in resizeNode
        const remainingChild = newChildren[0];
        const remainingCardEmbed =
          extractContainerSingleCardNode(remainingChild);

        if (remainingCardEmbed?.type.name === "supportingText") {
          // Only a SupportingText is left, remove the entire FlexContainer and its wrapper
          const containerResolvedPos = view.state.doc.resolve(flexContainerPos);
          const containerParent = containerResolvedPos.parent;
          const wrapperPos = containerResolvedPos.before();
          replaceWith(
            wrapperPos,
            wrapperPos + containerParent.nodeSize,
            Fragment.empty,
          );
        } else if (remainingCardEmbed) {
          const wrappedRemainingCard =
            view.state.schema.nodes.resizeNode.create(
              {
                height: RESIZE_NODE_DEFAULT_HEIGHT,
                minHeight: RESIZE_NODE_MIN_HEIGHT,
              },
              [remainingCardEmbed],
            );

          // Replace the entire FlexContainer (and its resizeNode wrapper if it exists)
          const containerResolvedPos = view.state.doc.resolve(flexContainerPos);
          const containerParent = containerResolvedPos.parent;

          if (containerParent.type.name === "resizeNode") {
            // FlexContainer is wrapped in resizeNode, replace the entire wrapper
            const wrapperPos = containerResolvedPos.before();
            replaceWith(
              wrapperPos,
              wrapperPos + containerParent.nodeSize,
              wrappedRemainingCard,
            );
          } else {
            // FlexContainer is not wrapped, just replace it
            replaceWith(
              flexContainerPos,
              flexContainerPos + flexContainer.nodeSize,
              wrappedRemainingCard,
            );
          }
        }
      } else if (newChildren.length > 1) {
        // Multiple cards left, keep as FlexContainer
        const newFlexContainer = view.state.schema.nodes.flexContainer.create(
          flexContainer.attrs,
          newChildren,
        );
        replaceWith(
          flexContainerPos,
          flexContainerPos + flexContainer.nodeSize,
          newFlexContainer,
        );
      } else {
        // No cards left, remove the entire FlexContainer and its wrapper
        const containerResolvedPos = view.state.doc.resolve(flexContainerPos);
        const containerParent = containerResolvedPos.parent;

        if (containerParent.type.name === "resizeNode") {
          // Remove the entire resizeNode wrapper
          const wrapperPos = containerResolvedPos.before();
          replaceWith(
            wrapperPos,
            wrapperPos + containerParent.nodeSize,
            Fragment.empty,
          );
        } else {
          // Remove just the FlexContainer
          replaceWith(
            flexContainerPos,
            flexContainerPos + flexContainer.nodeSize,
            Fragment.empty,
          );
        }
      }

      // Now insert the wrapped node at drop position (after FlexContainer operations)
      const wrappedNode = view.state.schema.nodes.resizeNode.create(
        {
          height: RESIZE_NODE_DEFAULT_HEIGHT,
          minHeight: RESIZE_NODE_MIN_HEIGHT,
        },
        [draggedNode],
      );

      // Calculate adjusted drop position if the FlexContainer operations affected positions
      let adjustedDropPos = dropPos;
      if (dropPos > flexContainerPos) {
        adjustedDropPos += diffSize;
      }

      tr.insert(adjustedDropPos, wrappedNode);

      view.dispatch(tr);
      return true;
    }
  } else if (originalPos !== null) {
    // Handle general case: cardEmbed being moved within document or from resizeNode
    // Always ensure cardEmbed is wrapped in resizeNode when dropped in document
    const tr = view.state.tr;

    // Wrap the cardEmbed in a resizeNode
    const wrappedNode = view.state.schema.nodes.resizeNode.create(
      {
        height: RESIZE_NODE_DEFAULT_HEIGHT,
        minHeight: RESIZE_NODE_MIN_HEIGHT,
      },
      [draggedNode],
    );

    const nodeToRemove = originalParent || draggedNode;

    // Remove the original node from its position
    // Find the actual node to remove (could be the cardEmbed itself or its resizeNode wrapper)
    let removalHandled = false;
    let removePos: number | null = null;

    view.state.doc.descendants((node, pos) => {
      if (node === nodeToRemove && !removalHandled) {
        // Remove the node (whether it's a standalone cardEmbed or wrapped in resizeNode)
        tr.delete(pos, pos + node.nodeSize);
        removalHandled = true;
        removePos = pos;
        return false;
      }
    });

    let adjustedInsertPos = dropPos;
    if (removalHandled && removePos !== null && removePos < dropPos) {
      // If we removed something before the replace position, adjust it
      const removedSize = nodeToRemove.nodeSize;
      adjustedInsertPos = dropPos - removedSize;
    }

    // Insert wrapped node at drop position
    tr.insert(adjustedInsertPos, wrappedNode);

    view.dispatch(tr);
    return true;
  }
};
