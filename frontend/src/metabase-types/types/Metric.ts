import { TableId } from "./Table";

type GoogleAnalyticsMetricId = string;
export type MetricId = number | GoogleAnalyticsMetricId;

// TODO: incomplete
export type Metric = {
  name: string;
  id: MetricId;
  table_id: TableId;
  archived: boolean;
};
