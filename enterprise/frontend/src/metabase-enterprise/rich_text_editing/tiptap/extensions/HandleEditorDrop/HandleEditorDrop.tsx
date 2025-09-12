import { Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";

const wrapCardEmbed = (
  view: EditorView,
  cardEmbed: ProseMirrorNode,
): ProseMirrorNode => {
  const { nodes } = view.state.schema;
  return nodes.resizeNode.create({ height: 442, minHeight: 250 }, [
    nodes.flexContainer.create({}, [cardEmbed]),
  ]);
};

export const HandleEditorDrop = Extension.create({
  name: "handleEditorDrop",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("metabaseTiptapDrop"),
        props: {
          handleDrop: (view, e, slice, moved) => {
            // Helper function to extract cardEmbed from resizeNode wrapper
            const extractCardEmbed = (node: any) => {
              if (node.type.name === "cardEmbed") {
                return node;
              }
              if (
                node.type.name === "resizeNode" &&
                node.content.childCount === 1
              ) {
                const child = node.content.child(0);
                if (child.type.name === "cardEmbed") {
                  return child;
                }
              }
              return null;
            };

            // Check if we're moving a cardEmbed node
            if (slice.content.childCount === 1) {
              const droppedNode = slice.content.child(0);
              const cardEmbedNode = extractCardEmbed(droppedNode);

              if (cardEmbedNode && moved) {
                // Find the original position to determine context
                let cameFromFlexContainer = false;
                let originalPos: number | null = null;
                let originalParent: any = null;

                // Check if the original position was in a FlexContainer
                view.state.doc.descendants((node, pos, parent) => {
                  if (
                    node === droppedNode ||
                    extractCardEmbed(node) === cardEmbedNode
                  ) {
                    originalPos = pos;
                    originalParent = parent;

                    if (parent?.type.name === "flexContainer") {
                      cameFromFlexContainer = true;
                    }
                    return false;
                  }
                });

                // Find the position where the card was dropped
                const coords = view.posAtCoords({
                  left: e.clientX,
                  top: e.clientY,
                });

                if (coords) {
                  const dropPos = coords.pos;
                  const resolvedPos = view.state.doc.resolve(dropPos);
                  const dropParent = resolvedPos.parent;

                  if (dropParent.type.name === "flexContainer") {
                    // Handle dropping within a FlexContainer
                    if (
                      cameFromFlexContainer &&
                      originalParent === dropParent
                    ) {
                      // Moving within the same FlexContainer - reorder cards
                      const tr = view.state.tr;

                      // Find the source index
                      const sourceIndex = view.state.doc
                        .resolve(originalPos)
                        .index();

                      // Calculate the intended insertion index based on drop position
                      let targetIndex = 0;
                      const targetCardEmbedDOM =
                        e.target instanceof Element
                          ? e.target.closest(".node-cardEmbed")
                          : null;
                      if (targetCardEmbedDOM) {
                        const pos = view.posAtDOM(targetCardEmbedDOM, 0);
                        const targetCardEmbed = view.state.doc.nodeAt(pos);
                        if (targetCardEmbed) {
                          targetIndex =
                            dropParent.content.content.indexOf(targetCardEmbed);
                        }
                        const rect = targetCardEmbedDOM.getBoundingClientRect();
                        const xPct = (e.clientX - rect.left) / rect.width;
                        if (xPct >= 0.5) {
                          targetIndex++;
                        }
                      }

                      if (targetIndex === sourceIndex) {
                        return true;
                      } else {
                        // Create array of all children except the dragged one
                        const allChildren = [];
                        for (let i = 0; i < dropParent.childCount; i++) {
                          if (i !== sourceIndex) {
                            const child = dropParent.child(i);
                            const childCardEmbed = extractCardEmbed(child);
                            allChildren.push(
                              childCardEmbed ? childCardEmbed : child,
                            );
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
                        allChildren.splice(
                          adjustedTargetIndex,
                          0,
                          cardEmbedNode,
                        );

                        const children = allChildren;

                        const newContainer =
                          view.state.schema.nodes.flexContainer.create(
                            dropParent.attrs,
                            children,
                          );

                        const containerPos = resolvedPos.before();

                        tr.replaceWith(
                          containerPos,
                          containerPos + dropParent.nodeSize,
                          newContainer,
                        );

                        view.dispatch(tr);

                        return true;
                      }
                    }
                    // If not same FlexContainer, fall through to allow default behavior
                    return false;
                  }

                  // Check if dropping into document (not into another flexContainer or cardEmbed)
                  if (
                    dropParent.type.name !== "flexContainer" &&
                    dropParent.type.name !== "cardEmbed"
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
                            const wrappedRemainingCard = wrapCardEmbed(
                              view,
                              remainingCardEmbed,
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
                        const wrappedNode = wrapCardEmbed(view, cardEmbedNode);

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
                      const wrappedNode = wrapCardEmbed(view, cardEmbedNode);

                      // Remove the original node from its position
                      if (originalPos !== null) {
                        // Find the actual node to remove (could be the cardEmbed itself or its resizeNode wrapper)
                        view.state.doc.descendants((node, pos) => {
                          if (
                            node === droppedNode ||
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
              }
            }

            // Return false to allow default drop behavior for other cases
            return false;
          },
        },
      }),
    ];
  },
});
