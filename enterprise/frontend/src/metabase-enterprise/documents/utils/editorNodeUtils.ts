import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { Editor } from "@tiptap/react";

/**
 * Updates a card embed node's ID in the ProseMirror editor
 *
 * Preserves exact behavior from EmbedQuestionSettingsSidebar.
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
