import type { NodeViewProps } from "@tiptap/core";
import {
  OrderedList,
  type OrderedListOptions,
} from "@tiptap/extension-ordered-list";
import { NodeViewContent, ReactNodeViewRenderer } from "@tiptap/react";

import { createIdAttribute, createProseMirrorPlugin } from "../NodeIds";
import { type BlockNodeOptions, DefaultBlockShell } from "../shared/BlockShell";

export const CustomOrderedList = OrderedList.extend<
  OrderedListOptions & BlockNodeOptions
>({
  addAttributes() {
    return {
      start: {
        default: 1,
        parseHTML: (element: HTMLElement) => {
          return element.hasAttribute("start")
            ? parseInt(element.getAttribute("start") || "", 10)
            : 1;
        },
      },
      type: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute("type"),
      },
      ...createIdAttribute(),
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(OrderedListNodeView);
  },

  addProseMirrorPlugins() {
    return [createProseMirrorPlugin(OrderedList.name)];
  },
});

export const OrderedListNodeView = ({
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
      <NodeViewContent<"ol"> as="ol" />
    </BlockShell>
  );
};
