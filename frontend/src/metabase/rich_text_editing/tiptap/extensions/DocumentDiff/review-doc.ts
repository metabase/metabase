import type { JSONContent } from "@tiptap/core";

import { DIFF_DELETION_MARK, DIFF_INSERTION_MARK } from "./DocumentDiff";
import type { BlockDiff } from "./diff";

// Tag every text node under `node` with the given diff mark + changeId so the
// editor renders the visual diff and the controls plugin can find the change.
function markTextNodes(
  node: JSONContent,
  markType: string,
  changeId: number,
): JSONContent {
  if (node.type === "text") {
    return {
      ...node,
      marks: [...(node.marks ?? []), { type: markType, attrs: { changeId } }],
    };
  }
  if (node.content) {
    return {
      ...node,
      content: node.content.map((child) =>
        markTextNodes(child, markType, changeId),
      ),
    };
  }
  return node;
}

/**
 * Build the merged "review document" blocks from a `BlockDiff`: unchanged blocks
 * pass through, added/removed blocks get their text tagged with the insertion /
 * deletion mark so the `DocumentDiff` extension renders the diff.
 */
export function buildReviewContent(diff: BlockDiff): JSONContent[] {
  return diff.blocks.map(({ block, status, changeId }) => {
    if (status === "unchanged" || changeId == null) {
      return block;
    }
    const markType =
      status === "added" ? DIFF_INSERTION_MARK : DIFF_DELETION_MARK;
    return markTextNodes(block, markType, changeId);
  });
}
