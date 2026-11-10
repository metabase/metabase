import type { CollectionId, DatasetColumn } from "metabase-types/api";

export interface NewMetricValues {
  name: string;
  description: string | null;
  resultMetadata: DatasetColumn[] | null;
  collection_id: CollectionId | null;
  result_metadata: DatasetColumn[] | null;
}
