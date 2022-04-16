import { TableId } from "./Table";

export type MetricId = number | string;

// TODO: incomplete
export type Metric = {
  name: string;
  id: MetricId;
  table_id: TableId;
  archived: boolean;
};
