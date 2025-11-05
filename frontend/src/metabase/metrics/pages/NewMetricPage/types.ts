import type { DatasetColumn } from "metabase-types/api";

export type NewMetricValues = {
  name: string;
  description: string | null;
  resultMetadata: DatasetColumn[] | null;
};
