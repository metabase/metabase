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

export interface CreateMetricRequest {
  name: string;
  table_id: TableId;
  definition: StructuredQuery;
  description?: string;
}

export interface UpdateMetricRequest {
  id: MetricId;
  name?: string;
  definition?: StructuredQuery;
  revision_message: string;
  archived?: boolean;
  caveats?: string;
  description?: string;
  points_of_interest?: string;
  show_in_getting_started?: boolean;
}

export interface DeleteMetricRequest {
  id: MetricId;
  revision_message: string;
}
