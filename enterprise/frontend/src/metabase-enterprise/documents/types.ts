import type { State } from "metabase-types/store";

import type { DocumentsState } from "./documents.slice";

export interface DocumentsStoreState extends State {
  plugins?: {
    documents?: DocumentsState;
  };
}

export type FormattingOptions = {
  bold?: boolean;
  italic?: boolean;
  strikethrough?: boolean;
  h1?: boolean;
  h2?: boolean;
  h3?: boolean;
  list?: boolean;
  ordered_list?: boolean;
  quote?: boolean;
  inline_code?: boolean;
  code_block?: boolean;
};
