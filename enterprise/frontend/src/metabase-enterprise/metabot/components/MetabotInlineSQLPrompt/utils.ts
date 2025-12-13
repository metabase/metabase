import type { EditorView } from "@codemirror/view";

import type {
  DatabaseId,
  MetabotCodeEditorBufferContext,
} from "metabase-types/api";

export function extractMetabotBufferContext(
  view: EditorView,
  databaseId: DatabaseId | null,
): MetabotCodeEditorBufferContext {
  const state = view.state;
  const selection = state.selection.main;
  const cursorLine = state.doc.lineAt(selection.head);

  const buffer: MetabotCodeEditorBufferContext = {
    id: "default",
    source: {
      language: "sql",
      databaseId,
    },
    cursor: {
      line: cursorLine.number,
      column: cursorLine.from,
    },
  };

  if (!selection.empty) {
    const startLine = state.doc.lineAt(selection.from);
    const endLine = state.doc.lineAt(selection.to);

    buffer.selection = {
      text: state.sliceDoc(selection.from, selection.to),
      start: {
        line: startLine.number,
        column: selection.from - startLine.from,
      },
      end: {
        line: endLine.number,
        column: selection.to - endLine.from,
      },
    };
  }

  return buffer;
}
