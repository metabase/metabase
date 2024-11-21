import { type Component, type LegacyRef, forwardRef } from "react";

import type NativeQuery from "metabase-lib/v1/queries/NativeQuery";
import type {
  CardId,
  Collection,
  NativeQuerySnippet,
} from "metabase-types/api";

import { AceEditor } from "./AceEditor";
import type { SelectionRange } from "./types";

export type EditorProps = {
  query: NativeQuery;
  onChange?: (queryText: string) => void;

  readOnly?: boolean;

  snippets?: NativeQuerySnippet[];
  snippetCollections?: Collection[];

  onCursorMoveOverCardTag?: (id: CardId) => void;
  onRightClickSelection?: () => void;
  onSelectionChange?: (range: SelectionRange) => void;
};

export interface EditorHandle extends Component<EditorProps> {
  focus: () => void;
  resize: () => void;
  getSelectionTarget: () => Element | null;
}

export const Editor = forwardRef<EditorHandle, EditorProps>(
  function Editor(props, ref) {
    return <AceEditor {...props} ref={ref as LegacyRef<typeof AceEditor>} />;
  },
);
