import { Extension } from "@tiptap/core";
import { Fragment, type Node, Slice } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { NodeViewProps } from "@tiptap/react";

import {
  RESIZE_NODE_DEFAULT_HEIGHT,
  RESIZE_NODE_MIN_HEIGHT,
} from "metabase-enterprise/rich_text_editing/tiptap/extensions/ResizeNode/ResizeNode";

import {
  extractCardEmbed,
  getCardEmbedDropSide,
  getDroppedCardEmbedNodeData,
  getTargetCardEmbedNode,
} from "./utils";

declare module "prosemirror-view" {
  // This adds a new configuration option to the NodeConfig
  class EditorView {
    draggingNode?: NodeViewProps["node"] | null;
  }
}

export const HandleEditorDrop = Extension.create({
  name: "handleEditorDrop",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("metabaseTiptapDrop"),
        props: {
          handleDrop: (view, e, slice, moved) => {
            const cardEmbedInitialData = getDroppedCardEmbedNodeData(
              view,
              e,
              slice,
              moved,
            );

            if (cardEmbedInitialData) {
              const {
                cardEmbedNode,
                originalPos,
                originalParent,
                cameFromFlexContainer,
                dropPos,
                dropToParentPos,
                dropToParent,
              } = cardEmbedInitialData;

              // Dropping inside a flexContainer
              if (dropToParent.type.name === "flexContainer") {
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
                  const sourceIndex = view.state.doc
                    .resolve(originalPos)
                    .index();

                  // Calculate the intended insertion index based on drop position
                  let targetIndex =
                    dropToParent.content.content.indexOf(targetCardEmbedNode);
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
                  if (
                    sourceIndex === 0 &&
                    targetIndex === 1 &&
                    allChildren.length === 1
                  ) {
                    adjustedTargetIndex = 1; // Insert after the remaining element
                  }

                  // Insert the dragged element at the correct position
                  allChildren.splice(adjustedTargetIndex, 0, cardEmbedNode);

                  const newContainer =
                    view.state.schema.nodes.flexContainer.create(
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
                  let targetIndex =
                    dropToParent.content.content.indexOf(targetCardEmbedNode);
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
                  const newFlexContainer =
                    view.state.schema.nodes.flexContainer.create(
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
              }

              const targetCardEmbed = extractCardEmbed(dropToParent);
              // Dropping on another cardEmbed
              if (
                targetCardEmbed &&
                targetCardEmbed.type.name === "cardEmbed"
              ) {
                if (targetCardEmbed === cardEmbedNode) {
                  return true; // Prevent dropping on itself
                }

                const dropSide = getCardEmbedDropSide(e);
                // Create new FlexContainer when dropping on a standalone CardEmbed
                const children =
                  dropSide === "left"
                    ? [cardEmbedNode.copy(), targetCardEmbed.copy()]
                    : [targetCardEmbed.copy(), cardEmbedNode.copy()];

                const flexContainer =
                  view.state.schema.nodes.flexContainer.create({}, children);

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
                  originalParent.type.name === "resizeNode"
                    ? originalParent
                    : cardEmbedNode;
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
                if (
                  removalHandled &&
                  removePos !== null &&
                  removePos < replacePos
                ) {
                  // If we removed something before the replace position, adjust it
                  const removedSize = nodeToRemove.nodeSize;
                  adjustedReplacePos = replacePos - removedSize;
                }

                tr.replaceWith(
                  adjustedReplacePos,
                  adjustedReplacePos + replaceSize,
                  wrapper,
                );

                if (cameFromFlexContainer) {
                  // TODO: check if we need to clean up the original flexContainer if it had only 1 card left
                }

                view.dispatch(tr);
                return true;
              }

              // Check if dropping into document (not into another flexContainer or cardEmbed)
              if (
                dropToParent.type.name !== "flexContainer" &&
                dropToParent.type.name !== "cardEmbed" &&
                dropToParent.type.name !== "resizeNode"
              ) {
                if (cameFromFlexContainer) {
                  // Handle moving from FlexContainer to document
                  if (
                    originalPos !== null &&
                    originalParent?.type.name === "flexContainer"
                  ) {
                    const tr = view.state.tr;

                    // First, update/remove from FlexContainer (do this BEFORE insertion to avoid position shifting)
                    const flexContainerPos = view.state.doc
                      .resolve(originalPos)
                      .before();
                    const flexContainer = originalParent;

                    // Remove the card from the FlexContainer
                    const newChildren = [];
                    const sourceIndex = view.state.doc
                      .resolve(originalPos)
                      .index();

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
                        extractCardEmbed(remainingChild);

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
                        const containerResolvedPos =
                          view.state.doc.resolve(flexContainerPos);
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
                      const newFlexContainer =
                        view.state.schema.nodes.flexContainer.create(
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
                      const containerResolvedPos =
                        view.state.doc.resolve(flexContainerPos);
                      const containerParent = containerResolvedPos.parent;

                      if (containerParent.type.name === "resizeNode") {
                        // Remove the entire resizeNode wrapper
                        const wrapperPos = containerResolvedPos.before();
                        tr.delete(
                          wrapperPos,
                          wrapperPos + containerParent.nodeSize,
                        );
                      } else {
                        // Remove just the FlexContainer
                        tr.delete(
                          flexContainerPos,
                          flexContainerPos + flexContainer.nodeSize,
                        );
                      }
                    }

                    // Now insert the wrapped node at drop position (after FlexContainer operations)
                    const wrappedNode =
                      view.state.schema.nodes.resizeNode.create(
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
              }
            }

            // Return false to allow default drop behavior for other cases
            return false;
          },

          handleDOMEvents: {
            dragstart: (view, event) => {
              const maybePos = view.posAtCoords({
                left: event.clientX,
                top: event.clientY,
              });

              if (maybePos) {
                const { pos } = maybePos;
                const node = view.state.doc.nodeAt(pos);

                view.draggingNode = node;
                return false;
              }
            },
          },

          transformPasted: (slice, view) => {
            const { content } = slice.content;
            const isPastingCardEmbed =
              content.length === 1 && content[0]?.type.name === "cardEmbed";

            if (!isPastingCardEmbed) {
              return slice;
            }

            const { state } = view;
            const resolvedPos = state.doc.resolve(state.selection.from);
            const isTopLevelParagraph =
              resolvedPos.parent.type.name === "paragraph" &&
              resolvedPos.depth === 1;

            if (!isTopLevelParagraph) {
              return slice;
            }

            const transformedContent = slice.content.content.map((node) => {
              return state.schema.nodes.resizeNode.create({}, [node]);
            });

            return new Slice(
              Fragment.fromArray(transformedContent),
              slice.openStart,
              slice.openEnd,
            );
          },
        },
      }),
    ];
  },
});
