import type { NodeViewProps } from "@tiptap/react";

declare module "prosemirror-view" {
  // This adds a new configuration option to the NodeConfig
  interface EditorView {
    draggingNode?: NodeViewProps["node"] | null;
  }
}
