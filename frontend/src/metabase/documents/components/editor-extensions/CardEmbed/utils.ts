import { findParentNodeClosestToPos } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { NodeViewProps } from "@tiptap/react";

import { MAX_GROUP_SIZE } from "metabase/rich_text_editing/tiptap/extensions/shared/constants";

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

/**
 * A card can get supporting text when it stands alone, or when its group has
 * room for another item and no supporting text yet. `pos` is undefined while
 * the node view is detached from the document.
 */
export function canAddSupportingText(
  doc: ProseMirrorNode,
  pos: number | undefined,
) {
  if (!pos) {
    return false;
  }
  const match = findParentNodeClosestToPos(
    doc.resolve(pos),
    (node) => node.type.name === "flexContainer",
  );
  if (!match) {
    return true;
  }
  if (match.node.childCount >= MAX_GROUP_SIZE) {
    return false;
  }
  return !match.node.content.content.some(
    (node) => node.type.name === "supportingText",
  );
}
