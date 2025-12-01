import type { DatasetQuery } from "./query";
import type { Table, TableId } from "./table";

export type SegmentId = number;

export interface Segment {
  id: SegmentId;
  name: string;
  description: string;
  table_id: TableId;
  table?: Table;
  archived: boolean;
  // Backend always returns MBQL5 format
  definition: DatasetQuery;
  definition_description: string;
  revision_message?: string;
}

export interface CreateSegmentRequest {
  name: string;
  table_id: TableId;
  definition: DatasetQuery;
  description?: string;
}

export interface UpdateSegmentRequest {
  id: SegmentId;
  name?: string;
  definition?: DatasetQuery;
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
