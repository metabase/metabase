import {
  RESIZE_NODE_DEFAULT_HEIGHT,
  RESIZE_NODE_MIN_HEIGHT,
} from "../../ResizeNode/ResizeNode";
import { type DroppedCardEmbedNodeData, extractCardEmbed } from "../utils";

export const handleCardDropOnDocument = (payload: DroppedCardEmbedNodeData) => {
  const {
    originalParent,
    originalPos,
    view,
    cameFromFlexContainer,
    event: e,
    cardEmbedNode,
    dropPos,
  } = payload;
  if (cameFromFlexContainer) {
    // Handle moving from FlexContainer to document
    if (originalPos !== null && originalParent?.type.name === "flexContainer") {
      const tr = view.state.tr;

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
        const remainingCardEmbed = extractCardEmbed(remainingChild);

        if (remainingCardEmbed) {
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
            tr.replaceWith(
              wrapperPos,
              wrapperPos + containerParent.nodeSize,
              wrappedRemainingCard,
            );
          } else {
            // FlexContainer is not wrapped, just replace it
            tr.replaceWith(
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
        tr.replaceWith(
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
          tr.delete(wrapperPos, wrapperPos + containerParent.nodeSize);
        } else {
          // Remove just the FlexContainer
          tr.delete(
            flexContainerPos,
            flexContainerPos + flexContainer.nodeSize,
          );
        }
      }

      // Now insert the wrapped node at drop position (after FlexContainer operations)
      const wrappedNode = view.state.schema.nodes.resizeNode.create(
        {
          height: RESIZE_NODE_DEFAULT_HEIGHT,
          minHeight: RESIZE_NODE_MIN_HEIGHT,
        },
        [cardEmbedNode],
      );

      // Calculate adjusted drop position if the FlexContainer operations affected positions
      let adjustedDropPos = dropPos;
      if (dropPos > flexContainerPos) {
        // If dropping after the FlexContainer, positions might have shifted
        // This is complex to calculate, so let's recalculate
        const coords = view.posAtCoords({
          left: e.clientX,
          top: e.clientY,
        });
        if (coords) {
          adjustedDropPos = tr.doc.resolve(coords.pos).pos;
        }
      }

      tr.insert(adjustedDropPos, wrappedNode);

      view.dispatch(tr);
      return true;
    }
  } else {
    // Handle general case: cardEmbed being moved within document or from resizeNode
    // Always ensure cardEmbed is wrapped in resizeNode when dropped in document
    const tr = view.state.tr;

    // Wrap the cardEmbed in a resizeNode
    const wrappedNode = view.state.schema.nodes.resizeNode.create(
      {
        height: RESIZE_NODE_DEFAULT_HEIGHT,
        minHeight: RESIZE_NODE_MIN_HEIGHT,
      },
      [cardEmbedNode],
    );

    // Remove the original node from its position
    if (originalPos !== null) {
      // Find the actual node to remove (could be the cardEmbed itself or its resizeNode wrapper)
      view.state.doc.descendants((node, pos) => {
        if (
          node === originalParent ||
          extractCardEmbed(node) === cardEmbedNode
        ) {
          // Remove the node (whether it's a standalone cardEmbed or wrapped in resizeNode)
          tr.delete(pos, pos + node.nodeSize);
          return false;
        }
      });
    }

    // Insert wrapped node at drop position
    tr.insert(dropPos, wrappedNode);

    view.dispatch(tr);
    return true;
  }
};
