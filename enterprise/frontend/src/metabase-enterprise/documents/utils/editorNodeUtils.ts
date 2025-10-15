import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { EditorState } from "@tiptap/pm/state";
import type { Editor, NodeViewProps } from "@tiptap/react";

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

export function isTopLevel({
  editor,
  getPos,
}: Pick<NodeViewProps, "editor" | "getPos">) {
  if (!editor || !getPos) {
    return true;
  }

  const pos = getPos();

  if (pos === null || pos === undefined) {
    return true;
  }

  const resolvedPos = editor.state.doc.resolve(pos);
  return resolvedPos.depth === 0;
}

export const isMetabotBlock = (state: EditorState): boolean =>
  state.selection.$head.parent.type.name === "metabot";
