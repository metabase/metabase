import { SegmentFilter, StructuredQuery } from "metabase-types/types/Query";
import { SegmentId, ISegment } from "metabase-types/api";

import Table from "./Table";
import Metadata from "./Metadata";

export type HydratedSegmentProperties = {
  table: Table;
  metadata: Metadata;
};

export default class Segment implements ISegment {
  id: SegmentId;
  name: string;
  description: string;
  archived: boolean;
  table_id: number;
  definition: StructuredQuery;
  creator_id: number;
  created_at: string;
  updated_at: string;

  table: Table | null;
  metadata: Metadata | null;

  constructor(segment: ISegment) {
    this.id = segment.id;
    this.name = segment.name;
    this.description = segment.description;
    this.archived = segment.archived;
    this.table_id = segment.table_id;
    this.definition = segment.definition;
    this.creator_id = segment.creator_id;
    this.created_at = segment.created_at;
    this.updated_at = segment.updated_at;

    // these properties are hydrated after instantiation in metabase/selectors/metadata
    this.table = null;
    this.metadata = null;

    Object.assign(this, segment);
  }

  displayName() {
    return this.name;
  }

  filterClause(): SegmentFilter {
    return ["segment", this.id];
  }

  isActive() {
    return !this.archived;
  }
}
