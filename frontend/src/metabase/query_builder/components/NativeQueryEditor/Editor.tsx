import type { Component } from "react";

import type Question from "metabase-lib/v1/Question";
import type NativeQuery from "metabase-lib/v1/queries/NativeQuery";
import type {
  Card,
  CardId,
  Collection,
  NativeQuerySnippet,
} from "metabase-types/api";

import type { AutocompleteItem, SelectionRange } from "./types";

type CardCompletionItem = Pick<Card, "id" | "name" | "type"> & {
  collection_name: string;
};

export type EditorProps = {
  question: Question;

  query: NativeQuery;
  setDatasetQuery: (query: NativeQuery) => Promise<Question>;

  fetchQuestion: (cardId: CardId) => Promise<Card>;
  autocompleteResultsFn: (prefix: string) => Promise<AutocompleteItem[]>;
  cardAutocompleteResultsFn: (prefix: string) => Promise<CardCompletionItem[]>;

  nativeEditorSelectedText?: string;
  setNativeEditorSelectedRange: (range: SelectionRange) => void;

  snippets?: NativeQuerySnippet[];
  snippetCollections?: Collection[];

  openDataReferenceAtQuestion: (id: CardId) => void;

  isSelectedTextPopoverOpen: boolean;
  onToggleSelectedTextContextMenu: (open: boolean) => void;

  readOnly?: boolean;
  width: number;
  viewHeight: number;

  onChange: (queryText: string) => void;
};

export interface Editor extends Component<EditorProps> {
  focus: () => void;
  resize: () => void;
  getSelectionTarget: () => Element | null;
}
