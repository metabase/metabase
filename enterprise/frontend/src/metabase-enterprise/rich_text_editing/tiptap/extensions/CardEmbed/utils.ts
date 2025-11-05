import type { NodeViewProps } from "@tiptap/react";

export function getEmbedIndex(
  editor: NodeViewProps["editor"],
  getPos: NodeViewProps["getPos"],
) {
  let embedIndex = -1;

  if (editor && getPos) {
    const currentPos = getPos() ?? 0;
    let nodeCount = 0;

    // Count cardEmbed nodes that appear before this position
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === "cardEmbed") {
        if (pos < currentPos) {
          nodeCount++;
        } else if (pos === currentPos) {
          embedIndex = nodeCount;
          return false; // Stop traversing
        }
      }
    });
  }

  return embedIndex;
}
