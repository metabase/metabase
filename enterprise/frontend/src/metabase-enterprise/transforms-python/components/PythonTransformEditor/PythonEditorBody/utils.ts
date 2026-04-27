import type { EditorView } from "@codemirror/view";
import type { SyntaxNodeRef } from "@lezer/common";

export const createPythonImportTokenLocator =
  (moduleName: string) =>
  (view: EditorView, node: SyntaxNodeRef): boolean => {
    if (node.type.name !== "VariableName") {
      return false;
    }
    const variableName = view.state.doc.sliceString(node.from, node.to);
    if (variableName !== moduleName) {
      return false;
    }
    let cur: SyntaxNodeRef | null = node;
    while (cur) {
      if (cur.type.name === "ImportStatement") {
        return true;
      }
      cur = cur.node.parent;
    }
    return false;
  };
