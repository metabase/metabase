import type { NodeViewProps } from "@tiptap/core";
import { Paragraph, type ParagraphOptions } from "@tiptap/extension-paragraph";
import { NodeViewContent, ReactNodeViewRenderer } from "@tiptap/react";

import { createIdAttribute, createProseMirrorPlugin } from "../NodeIds";
import { type BlockNodeOptions, DefaultBlockShell } from "../shared/BlockShell";

export const CustomParagraph = Paragraph.extend<
  ParagraphOptions & BlockNodeOptions
>({
  addAttributes() {
    return {
      ...createIdAttribute(),
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(ParagraphNodeView);
  },

  addProseMirrorPlugins() {
    return [createProseMirrorPlugin(Paragraph.name)];
  },
});

export const ParagraphNodeView = ({
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
      <NodeViewContent<"p"> as="p" />
    </BlockShell>
  );
};
