import { StructuredQuery } from "metabase-types/types/Query";

export type MetricId = number | string;

export interface IMetric {
  id: MetricId;
  name: string;
  table_id: number;
  database_id: number;
  archived: boolean;
  description: string;
  definition: StructuredQuery;
  creator_id: number;
  created_at: string;
  updated_at: string;
}
