import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { EditorState } from "@tiptap/pm/state";
import type { Editor, JSONContent } from "@tiptap/react";

/**
 * Updates a card embed node's ID in the ProseMirror editor
 */
export function updateCardEmbedNodeId(
  editorInstance: Editor | null | undefined,
  selectedEmbedIndex: number | null,
  newDraftId: number,
): void {
  if (!editorInstance || selectedEmbedIndex === null) {
    return;
  }

  const { doc } = editorInstance.state;
  const tr = editorInstance.state.tr;
  let nodeCount = 0;
  let updated = false;

  doc.descendants((node: ProseMirrorNode, pos: number) => {
    if (updated) {
      return false;
    }
    if (node.type.name === "cardEmbed") {
      if (nodeCount === selectedEmbedIndex) {
        tr.setNodeMarkup(pos, undefined, {
          ...node.attrs,
          id: newDraftId,
        });
        updated = true;
        return false;
      }
      nodeCount++;
    }
  });

  if (tr.docChanged) {
    editorInstance.view.dispatch(tr);
  }
}

export const isMetabotBlock = (state: EditorState): boolean =>
  state.selection.$head.parent.type.name === "metabot";

// Commentable node types that existed before `_id` was required
const NODES_WITH_ID = new Set([
  "paragraph",
  "heading",
  "bulletList",
  "orderedList",
  "blockquote",
  "codeBlock",
  "cardEmbed",
  "supportingText",
]);

/**
 * Checks if a document needs a schema migration, in which case it should be considered dirty.
 * Commentable nodes need a persisted `_id` so comments can target them across reloads.
 */
export function doesDocumentNeedMigration(node: JSONContent): boolean {
  if (node.type && NODES_WITH_ID.has(node.type) && !node.attrs?._id) {
    return true;
  }
  if (node.content) {
    return node.content.some((child) => doesDocumentNeedMigration(child));
  }
  return false;
}
