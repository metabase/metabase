import { forwardRef } from "react";

import type NativeQuery from "metabase-lib/v1/queries/NativeQuery";
import type { CardId } from "metabase-types/api";

import { AceEditor } from "./AceEditor";
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

export const Editor = forwardRef<EditorRef, EditorProps>(
  function Editor(props, ref) {
    return <AceEditor {...props} ref={ref} />;
  },
);
