import { StructuredQuery } from "./query";
import { TableId } from "./table";

export type SegmentId = number;

export interface Segment {
  id: SegmentId;
  name: string;
  description: string;
  table_id: TableId;
  archived: boolean;
  definition: StructuredQuery;
  definition_description: string;
  revision_message?: string;
}
