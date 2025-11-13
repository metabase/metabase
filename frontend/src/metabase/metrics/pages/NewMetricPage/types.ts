import type { CollectionId, Field } from "metabase-types/api";

export type NewMetricValues = {
  name: string;
  description: string | null;
  resultMetadata: Field[] | null;
  collection_id: CollectionId | null;
  result_metadata: Field[] | null;
};
