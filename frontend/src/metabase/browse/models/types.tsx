import type { Dispatch, SetStateAction } from "react";

import type { RecentCollectionItem, SearchResult } from "metabase-types/api";

/**
 * Model retrieved through the search endpoint
 */
export type ModelResult = SearchResult<number, "dataset">;

/**
 * Model retrieved through the recent views endpoint
 */
export interface RecentModel extends RecentCollectionItem {
  model: "dataset";
}

/**
 * A model retrieved through either endpoint.
 * This type is needed so that our filtering functions can
 * filter arrays of models retrieved from either endpoint.
 */
export type FilterableModel = ModelResult | RecentModel;

export type AvailableModelFilters = Record<
  string,
  {
    predicate: (value: FilterableModel) => boolean;
    activeByDefault: boolean;
  }
>;

export type ModelFilterControlsProps = {
  actualModelFilters: ActualModelFilters;
  setActualModelFilters: Dispatch<SetStateAction<ActualModelFilters>>;
};

/**
 * Mapping of filter names to true if the filter is active
 * or false if it is inactive
 */
export type ActualModelFilters = Record<string, boolean>;
