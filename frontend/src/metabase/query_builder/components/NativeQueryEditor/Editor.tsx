import { forwardRef } from "react";

import type NativeQuery from "metabase-lib/v1/queries/NativeQuery";
import type { CardId } from "metabase-types/api";

import { AceEditor } from "./AceEditor";
import { CodeMirrorEditor } from "./CodeMirrorEditor";
import type { SelectionRange } from "./types";

export type EditorProps = {
  query: NativeQuery;
  onChange?: (queryText: string) => void;
  readOnly?: boolean;
  onCursorMoveOverCardTag?: (id: CardId) => void;
  onRightClickSelection?: () => void;
  onSelectionChange?: (range: SelectionRange) => void;
};

export interface EditorRef {
  focus: () => void;
  resize: () => void;
  getSelectionTarget: () => Element | null;
}

function getMode(): "ace" | "codemirror" {
  // return "ace";
  return "codemirror";
}

export const Editor = forwardRef<EditorRef, EditorProps>(
  function Editor(props, ref) {
    switch (getMode()) {
      case "ace":
        return <AceEditor {...props} ref={ref} />;
      case "codemirror":
        return <CodeMirrorEditor {...props} ref={ref} />;
    }
  },
);
