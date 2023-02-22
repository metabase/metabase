/**
 * ⚠️
 * @deprecated use existing types from, or add to metabase-types/api/*
 */

import { TableId } from "./Table";

export type SegmentId = number;

// TODO: incomplete
export type Segment = {
  name: string;
  id: SegmentId;
  table_id: TableId;
  archived: boolean;
  description: string;
};
