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

export type ModelFilterSettings = {
  verified?: boolean;
};

export type ModelFilterControlsProps = {
  modelFilters: ModelFilterSettings;
  setModelFilters: (settings: ModelFilterSettings) => void;
};
