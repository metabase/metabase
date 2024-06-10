import type { MutableRefObject } from "react";

import type {
  RecentCollectionItem,
  RecentItem,
  SearchResult,
} from "metabase-types/api";

export type RefProp<RefValue> = {
  ref: MutableRefObject<RefValue> | ((value: RefValue) => void);
};

/** Model retrieved through the search endpoint */
export type ModelResult = SearchResult<number, "dataset">;

/** Model retrieved through the recent views endpoint */
export interface RecentModel extends RecentCollectionItem {
  model: "dataset";
}

export const isRecentModel = (item: RecentItem): item is RecentModel =>
  item.model === "dataset";

/** A model retrieved through either endpoint.
 * This type is needed so that our filtering functions can
 * filter arrays of models retrieved from either endpoint. */
export type FilterableModel = ModelResult | RecentModel;
