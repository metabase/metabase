import type { NodeViewProps } from "@tiptap/core";
import {
  Blockquote,
  type BlockquoteOptions,
} from "@tiptap/extension-blockquote";
import { NodeViewContent, ReactNodeViewRenderer } from "@tiptap/react";

import { createIdAttribute, createProseMirrorPlugin } from "../NodeIds";
import { type BlockNodeOptions, DefaultBlockShell } from "../shared/BlockShell";

export const CustomBlockquote = Blockquote.extend<
  BlockquoteOptions & BlockNodeOptions
>({
  addAttributes() {
    return {
      ...createIdAttribute(),
    };
  },

  addKeyboardShortcuts() {
    return {};
  },

  addNodeView() {
    return ReactNodeViewRenderer(BlockquoteNodeView);
  },

  addProseMirrorPlugins() {
    return [createProseMirrorPlugin(Blockquote.name)];
  },
});

export const BlockquoteNodeView = ({
  node,
  editor,
  getPos,
  extension,
}: NodeViewProps) => {
  const BlockShell = extension.options.blockShell ?? DefaultBlockShell;

  return (
    <BlockShell
      node={node}
      editor={editor}
      getPos={getPos}
      hideMenus={extension.options.editorContext === "comments"}
    >
      <NodeViewContent<"blockquote"> as="blockquote" />
    </BlockShell>
  );
};
