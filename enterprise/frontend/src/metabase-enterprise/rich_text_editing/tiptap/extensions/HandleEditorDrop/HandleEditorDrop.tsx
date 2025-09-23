import { Extension } from "@tiptap/core";
import { Fragment, type NodeType as PMNodeType, Slice } from "@tiptap/pm/model";
import { NodeSelection, Plugin, PluginKey } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import type { NodeViewProps } from "@tiptap/react";

import {
  handleCardDropOnCard,
  handleCardDropToFlexContainer,
} from "./DropHandlers";
import { handleCardDropOnDocument } from "./DropHandlers/cardToDocument";
import {
  type DroppedCardEmbedNodeData,
  extractCardEmbed,
  getDroppedCardEmbedNodeData,
} from "./utils";

declare module "prosemirror-view" {
  // This adds a new configuration option to the NodeConfig
  interface EditorView {
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
              const { dropToParent } = cardEmbedInitialData;

              // Dropping inside a flexContainer
              if (dropToParent.type.name === "flexContainer") {
                return handleCardDropToFlexContainer(cardEmbedInitialData);
              }

              const targetCardEmbed = extractCardEmbed(dropToParent);
              // Dropping on another cardEmbed
              if (
                targetCardEmbed &&
                targetCardEmbed.type.name === "cardEmbed"
              ) {
                return handleCardDropOnCard(
                  cardEmbedInitialData,
                  targetCardEmbed,
                );
              }

              if (dropToParent.type.name === "paragraph") {
                return handleCardDropOnParagraph(cardEmbedInitialData);
              }

              // Check if dropping into document (not into another flexContainer or cardEmbed)
              if (
                dropToParent.type.name !== "flexContainer" &&
                dropToParent.type.name !== "cardEmbed" &&
                dropToParent.type.name !== "resizeNode"
              ) {
                handleCardDropOnDocument(cardEmbedInitialData);
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

          handleTextInput: (view) => {
            const { state } = view;
            const { selection } = state;

            // Check if we have a node selection on a cardEmbed
            if (selection instanceof NodeSelection) {
              const selectedNode = selection.node;
              if (selectedNode.type.name === "cardEmbed") {
                // Ignore text input when a cardEmbed is selected
                return true; // Prevent default behavior
              }
            }
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

const handleCardDropOnParagraph = ({
  originalPos,
  view,
  dropToParentPos,
  event,
  cameFromFlexContainer,
}: DroppedCardEmbedNodeData) => {
  const resolvedPos = dropToParentPos;
  // Get the DOM element of the paragraph.
  const paragraphDOM = view.domAtPos(resolvedPos.start()).node as Element;
  const rect = paragraphDOM.getBoundingClientRect();
  // If dropping in the upper half of the paragraph, insert before; else, insert after.
  const insertBefore = event.clientY < rect.top + rect.height / 2;

  const targetPos = insertBefore ? resolvedPos.start() : resolvedPos.end();
  // Create a transaction that inserts the slice at the computed target position.
  moveNode(
    view,
    originalPos,
    targetPos,
    cameFromFlexContainer ? view.state.schema.nodes.resizeNode : undefined,
  );
  // If we have moved content out of a flex container, we may need to unwrap an unneeded flex container
  cleanupFlexContainerNodes(view);
  return true; // Indicate that we've handled the drop.
};

const moveNode = (
  view: EditorView,
  fromPos: number,
  toPos: number,
  wrapper?: PMNodeType,
) => {
  const { state } = view;
  const { tr, doc } = state;

  // Get the node at the fromPos.
  const node = doc.nodeAt(fromPos);
  if (!node) {
    console.error("No node found at position", fromPos);
    return;
  }

  const possiblyWrappedNode = wrapper ? wrapper.create({}, [node]) : node;

  // Calculate the range: from the start of the node to its end.
  const start = fromPos;
  const end = fromPos + node.nodeSize;

  // Delete the node from its current location.
  tr.delete(start, end);

  // Insert it at the new desired position.
  //
  // Note: Because you've already deleted the node, the toPos might need adjustment.
  // A simple approach is to calculate the new target position relative to the deletion.
  // If the node is moved to a location that comes after its original position,
  // subtract the node size from the target.
  const adjustedToPos = toPos > start ? toPos - node.nodeSize : toPos;

  tr.insert(adjustedToPos, possiblyWrappedNode);

  view.dispatch(tr);
};

// Traverses the document and unwraps any flexContainer nodes that only have 1 child
const cleanupFlexContainerNodes = (view: EditorView) => {
  view.state.doc.descendants((node, pos) => {
    if (node.type.name === "flexContainer" && node.childCount === 1) {
      const child = node.firstChild;
      if (child) {
        view.dispatch(
          view.state.tr.replaceWith(pos, pos + node.nodeSize, child),
        );
      }
    }
  });
};
