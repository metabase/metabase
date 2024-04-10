import type { StructuredQuery } from "./query";
import type { Table, TableId } from "./table";

export type SegmentId = number;

export interface Segment {
  id: SegmentId;
  name: string;
  description: string;
  table_id: TableId;
  table?: Table;
  archived: boolean;
  definition: StructuredQuery;
  definition_description: string;
  revision_message?: string;
}

export interface CreateSegmentRequest {
  name: string;
  table_id: TableId;
  definition: StructuredQuery;
  description?: string;
}

export interface UpdateSegmentRequest {
  id: SegmentId;
  name?: string;
  definition?: StructuredQuery;
  revision_message: string;
  archived?: boolean;
  caveats?: string;
  description?: string;
  points_of_interest?: string;
  show_in_getting_started?: boolean;
}

export interface DeleteSegmentRequest {
  id: SegmentId;
  revision_message: string;
}
