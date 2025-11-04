import type { CollectionItem } from "metabase-types/api";

export type ModelingItem = CollectionItem & {
  model: "dataset" | "metric";
  bookmark?: boolean;
};

export type SortColumn = "name" | "description";
