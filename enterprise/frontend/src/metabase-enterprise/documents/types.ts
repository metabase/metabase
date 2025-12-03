import type { State } from "metabase-types/store";

import type { DocumentsState } from "./documents.slice";

export interface DocumentsStoreState extends State {
  plugins?: {
    documents?: DocumentsState;
  };
}
