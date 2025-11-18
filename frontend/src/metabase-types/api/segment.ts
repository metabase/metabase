import type { CardId } from "./card";
import type { DatasetQuery } from "./query";
import type { Table, TableId } from "./table";

export type SegmentId = number;

export interface Segment {
  id: SegmentId;
  name: string;
  description: string;
  // A segment is associated with either a table or a card, but not both
  table_id?: TableId;
  card_id?: CardId;
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
