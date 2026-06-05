import type { CollectionId, Field } from "metabase-types/api";

export interface NewMetricValues {
  name: string;
  description: string | null;
  resultMetadata: Field[] | null;
  collection_id: CollectionId | null;
  result_metadata: Field[] | null;
}
