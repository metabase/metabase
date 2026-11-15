export type { ModelResult, RecentModel } from "metabase-types/api";

export type ModelFilterSettings = {
  verified?: boolean;
};

export type ModelFilterControlsProps = {
  modelFilters: ModelFilterSettings;
  setModelFilters: (settings: ModelFilterSettings) => void;
};

export type SortColumn = "name" | "collection" | "description";
