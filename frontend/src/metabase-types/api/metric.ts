import type { StructuredQuery } from "./query";
import type { TableId } from "./table";

export type MetricId = number | string;

export interface Metric {
  id: MetricId;
  name: string;
  description: string;
  table_id: TableId;
  archived: boolean;
  definition: StructuredQuery;
  revision_message?: string;
}
