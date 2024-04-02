import type { Action } from "kbar";

import type { CollectionId, DatabaseId } from "metabase-types/api";

export interface PaletteAction extends Action {
  extra?: {
    parentCollection?: CollectionId;
    isVerified?: boolean;
    databaseId?: DatabaseId;
  };
}
