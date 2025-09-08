import type { DragEndEvent } from "@dnd-kit/core";
import type { Editor as TiptapEditor } from "@tiptap/react";
import { useCallback } from "react";

const cleanupEmptyResizeNodes = (transaction: any) => {
  const emptyResizeNodePositions: { pos: number; node: any }[] = [];

  // Find all ResizeNode instances in the document
  transaction.doc.descendants((node: any, pos: number) => {
    if (node.type.name === "resizeNode") {
      // Check if the ResizeNode is empty or contains only whitespace
      const hasContent =
        node.content.content?.some((child: any) => {
          if (child.type.name === "paragraph") {
            // Check if paragraph has actual text content (not just whitespace)
            return child.textContent?.trim().length > 0;
          }
          // Non-paragraph content (like CardEmbed) is considered meaningful
          return (
            child.type.name !== "paragraph" ||
            child.textContent?.trim().length > 0
          );
        }) || false;

      if (!hasContent) {
        emptyResizeNodePositions.push({ pos, node });
      }
    }
  });

  // Remove empty ResizeNodes in reverse order to maintain positions
  emptyResizeNodePositions
    .sort((a, b) => b.pos - a.pos)
    .forEach(({ pos, node }) => {
      transaction.delete(pos, pos + node.nodeSize);
    });

  return transaction;
};

export const useCardEmbedDnD = (editor: TiptapEditor | null) => {
  /**
   * Finds and removes empty ResizeNode containers after a CardEmbed has been moved.
   * A ResizeNode is considered empty if it contains no content or only whitespace.
   */

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;

      if (!active || !over || active.id === over.id) {
        return;
      }

      // Handle reordering of CardEmbed nodes
      if (editor && active.id.toString().startsWith("card-embed-")) {
        const sourceId = active.id.toString().replace("card-embed-", "");
        const targetZoneId = over.id.toString().replace("drop-zone-", "");
        const direction = over.id.toString().includes("-left")
          ? "left"
          : "right";
        const targetId = targetZoneId
          .replace("-left", "")
          .replace("-right", "");

        // Don't allow dropping next to itself
        if (sourceId === targetId) {
          return;
        }

        // Find the source and target nodes in the document
        let sourcePos = -1;
        let targetPos = -1;
        let sourceNode: any = null;
        let targetNode: any = null;
        let targetFlexContainerPos = -1;
        let targetFlexContainer: any = null;
        let sourceFlexContainerPos = -1;
        let sourceFlexContainer: any = null;

        editor.state.doc.descendants((node, pos) => {
          if (
            node.type.name === "cardEmbed" &&
            node.attrs.id?.toString() === sourceId
          ) {
            sourcePos = pos;
            sourceNode = node;

            // Check if the source CardEmbed is inside a FlexContainer
            const currentPos = pos;
            editor.state.doc.nodesBetween(
              0,
              editor.state.doc.content.size,
              (node, nodePos) => {
                if (
                  nodePos <= currentPos &&
                  currentPos < nodePos + node.nodeSize
                ) {
                  if (node.type.name === "flexContainer") {
                    sourceFlexContainerPos = nodePos;
                    sourceFlexContainer = node;
                  }
                }
              },
            );
          }
          if (
            node.type.name === "cardEmbed" &&
            node.attrs.id?.toString() === targetId
          ) {
            targetPos = pos;
            targetNode = node;

            // Check if this CardEmbed is inside a FlexContainer by walking up the tree
            const currentPos = pos;
            editor.state.doc.nodesBetween(
              0,
              editor.state.doc.content.size,
              (node, nodePos) => {
                if (
                  nodePos <= currentPos &&
                  currentPos < nodePos + node.nodeSize
                ) {
                  if (node.type.name === "flexContainer") {
                    targetFlexContainerPos = nodePos;
                    targetFlexContainer = node;
                  }
                }
              },
            );
          }
        });

        if (sourcePos !== -1 && targetPos !== -1 && sourceNode && targetNode) {
          const tr = editor.state.tr;

          // Check if both source and target are in the same FlexContainer
          const bothInSameFlexContainer =
            sourceFlexContainerPos !== -1 &&
            targetFlexContainerPos !== -1 &&
            sourceFlexContainerPos === targetFlexContainerPos;

          if (bothInSameFlexContainer) {
            // Swap positions within the same FlexContainer
            const flexContainer = sourceFlexContainer;
            const containerContent = flexContainer.content.content
              ? flexContainer.content.content
              : flexContainer.content;

            // Find the indices for source and target CardEmbeds
            let sourceIndex = -1;
            let targetIndex = -1;
            let childPos = sourceFlexContainerPos + 1; // Start after container opening tag

            for (let i = 0; i < containerContent.length; i++) {
              const child = containerContent[i];
              if (
                childPos <= sourcePos &&
                sourcePos < childPos + child.nodeSize
              ) {
                sourceIndex = i;
              }
              if (
                childPos <= targetPos &&
                targetPos < childPos + child.nodeSize
              ) {
                targetIndex = i;
              }
              childPos += child.nodeSize;
            }

            if (sourceIndex !== -1 && targetIndex !== -1) {
              // Create new container content with reordered CardEmbeds
              const newContainerContent = [...containerContent];

              if (direction === "left") {
                // Insert source before target
                const sourceChild = newContainerContent[sourceIndex];
                newContainerContent.splice(sourceIndex, 1); // Remove source

                // Adjust target index if source was before it
                const adjustedTargetIndex =
                  sourceIndex < targetIndex ? targetIndex - 1 : targetIndex;
                newContainerContent.splice(adjustedTargetIndex, 0, sourceChild);
              } else {
                // Insert source after target
                const sourceChild = newContainerContent[sourceIndex];
                newContainerContent.splice(sourceIndex, 1); // Remove source

                // Adjust target index if source was before it
                const adjustedTargetIndex =
                  sourceIndex < targetIndex ? targetIndex - 1 : targetIndex;
                newContainerContent.splice(
                  adjustedTargetIndex + 1,
                  0,
                  sourceChild,
                );
              }

              // Create the updated FlexContainer
              const newFlexContainer = {
                type: "flexContainer",
                attrs: flexContainer.attrs,
                content: newContainerContent.map((child) =>
                  child.toJSON ? child.toJSON() : child,
                ),
              };

              // Replace the entire FlexContainer
              tr.replaceWith(
                sourceFlexContainerPos,
                sourceFlexContainerPos + flexContainer.nodeSize,
                editor.schema.nodeFromJSON(newFlexContainer),
              );
            }
          } else if (targetFlexContainerPos !== -1 && targetFlexContainer) {
            // Target is already in a FlexContainer - add the source CardEmbed to it
            const containerContent = targetFlexContainer.content.content
              ? targetFlexContainer.content.content
              : targetFlexContainer.content;

            // Check if FlexContainer already has 3 CardEmbeds (maximum allowed)
            if (containerContent.length >= 3) {
              return; // Don't allow more than 3 CardEmbeds
            }

            const newContainerContent = [...containerContent];

            // Insert the source CardEmbed at the appropriate position based on direction
            if (direction === "left") {
              // Find the index of the target CardEmbed and insert before it
              let targetIndex = 0;
              let childPos = targetFlexContainerPos + 1; // Start after container opening tag

              for (let i = 0; i < containerContent.length; i++) {
                const child = containerContent[i];
                if (
                  childPos <= targetPos &&
                  targetPos < childPos + child.nodeSize
                ) {
                  targetIndex = i;
                  break;
                }
                childPos += child.nodeSize;
              }

              newContainerContent.splice(targetIndex, 0, sourceNode);
            } else {
              // Insert after the target CardEmbed
              let targetIndex = 0;
              let childPos = targetFlexContainerPos + 1;

              for (let i = 0; i < containerContent.length; i++) {
                const child = containerContent[i];
                if (
                  childPos <= targetPos &&
                  targetPos < childPos + child.nodeSize
                ) {
                  targetIndex = i + 1;
                  break;
                }
                childPos += child.nodeSize;
              }

              newContainerContent.splice(targetIndex, 0, sourceNode);
            }

            // Create the new FlexContainer with updated content
            const newFlexContainer = {
              type: "flexContainer",
              attrs: targetFlexContainer.attrs,
              content: newContainerContent.map((child) =>
                child.toJSON ? child.toJSON() : child,
              ),
            };

            // Replace the FlexContainer and remove the source node
            tr.delete(sourcePos, sourcePos + sourceNode.nodeSize);

            // Adjust container position if source was before it
            const adjustedContainerPos =
              sourcePos < targetFlexContainerPos
                ? targetFlexContainerPos - sourceNode.nodeSize
                : targetFlexContainerPos;
            tr.replaceWith(
              adjustedContainerPos,
              adjustedContainerPos + targetFlexContainer.nodeSize,
              editor.schema.nodeFromJSON(newFlexContainer),
            );
          } else {
            // Target is not in a FlexContainer - create a new FlexContainer with both CardEmbeds
            const leftCardEmbed =
              direction === "left" ? sourceNode.toJSON() : targetNode.toJSON();
            const rightCardEmbed =
              direction === "left" ? targetNode.toJSON() : sourceNode.toJSON();

            const flexContainerContent = {
              type: "flexContainer",
              attrs: {},
              content: [leftCardEmbed, rightCardEmbed],
            };

            // Delete nodes in reverse order to maintain positions
            if (sourcePos > targetPos) {
              tr.delete(sourcePos, sourcePos + sourceNode.nodeSize);
              tr.delete(targetPos, targetPos + targetNode.nodeSize);
            } else {
              tr.delete(targetPos, targetPos + targetNode.nodeSize);
              tr.delete(sourcePos, sourcePos + sourceNode.nodeSize);
            }

            // Insert the FlexContainer at the position of whichever node was first
            const insertPos = Math.min(sourcePos, targetPos);
            tr.insert(
              insertPos,
              editor.schema.nodeFromJSON(flexContainerContent),
            );
          }

          // Apply cleanup logic to remove any empty ResizeNodes
          const cleanedTransaction = cleanupEmptyResizeNodes(tr);

          editor.view.dispatch(cleanedTransaction);
        }
      }
    },
    [editor],
  );

  return {
    handleDragEnd,
  };
};
