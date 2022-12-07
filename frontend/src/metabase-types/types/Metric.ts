/**
 * ⚠️
 * @deprecated use existing types from, or add to metabase-types/api/*
 */

import { TableId } from "./Table";

export type MetricId = number;

// TODO: incomplete
export type Metric = {
  name: string;
  id: MetricId;
  table_id: TableId;
  archived: boolean;
};
