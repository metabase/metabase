import type { NodeViewProps } from "@tiptap/react";
import { EditorView as PMEditorView } from "prosemirror-view";

declare module "prosemirror-view" {
  // This adds a new configuration option to the NodeConfig
  class EditorView extends PMEditorView {
    draggingNode?: NodeViewProps["node"] | null;
  }
}
