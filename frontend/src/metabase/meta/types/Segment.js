/* @flow */

import type { TableId } from "./Table";

export type SegmentId = number;

// TODO: incomplete
export type Segment = {
  name: string,
  id: SegmentId,
  table_id: TableId,
  is_active: boolean,
  description: string,
};
