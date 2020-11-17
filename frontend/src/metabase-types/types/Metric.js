/* @flow */

import type { TableId } from "./Table";

export type MetricId = number;

// TODO: incomplete
export type Metric = {
  name: string,
  id: MetricId,
  table_id: TableId,
  archived: boolean,
};
