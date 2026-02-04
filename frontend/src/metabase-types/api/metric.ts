import type { Collection, CollectionId } from "./collection";

export type MetricId = number;

export type Metric = {
  id: MetricId;
  name: string;
  description: string | null;
  dimensions: MetricDimension[];
  collection_id: CollectionId | null;
  collection: Collection | null;
};

export type MetricDimension = {
  id: string;
  display_name: string;
  effective_type: string;
  semantic_type: string | null;
};
