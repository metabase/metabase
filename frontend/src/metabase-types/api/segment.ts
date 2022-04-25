import { StructuredQuery } from "metabase-types/types/Query";

export type SegmentId = number;

export interface ISegment {
  id: SegmentId;
  name: string;
  description: string;
  archived: boolean;
  table_id: number;
  definition: StructuredQuery;
  creator_id: number;
  created_at: string;
  updated_at: string;
}
