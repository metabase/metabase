import { TableId } from "metabase-types/api/table";

export type SegmentId = number;

// TODO: incomplete
export type Segment = {
  name: string;
  id: SegmentId;
  table_id: TableId;
  archived: boolean;
  description: string;
};
