import { type Component, type LegacyRef, forwardRef } from "react";

import type NativeQuery from "metabase-lib/v1/queries/NativeQuery";
import type {
  Card,
  CardId,
  Collection,
  NativeQuerySnippet,
} from "metabase-types/api";

import { AceEditor } from "./AceEditor";
import type { AutocompleteItem, SelectionRange } from "./types";

type CardCompletionItem = Pick<Card, "id" | "name" | "type"> & {
  collection_name: string;
};

export type EditorProps = {
  query: NativeQuery;
  onChange?: (queryText: string) => void;

  readOnly?: boolean;

  autocompleteResultsFn?: (prefix: string) => Promise<AutocompleteItem[]>;
  cardAutocompleteResultsFn?: (prefix: string) => Promise<CardCompletionItem[]>;

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
