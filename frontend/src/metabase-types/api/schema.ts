import { Database, DatabaseId } from "./database";
import { Schema, SchemaId, Table, TableId } from "./table";
import { Field, FieldDimension, FieldId } from "./field";
import { Segment, SegmentId } from "./segment";
import { Metric, MetricId } from "./metric";
import { Timeline, TimelineEventId } from "./timeline";
import { Collection, CollectionId, CollectionItemId } from "./collection";

export interface NormalizedDatabase
  extends Omit<Database, "tables" | "schemas"> {
  tables?: TableId[];
  schemas?: SchemaId[];
}

export interface NormalizedSchema extends Omit<Schema, "database" | "tables"> {
  database?: DatabaseId;
  tables?: TableId[];
}

export interface NormalizedTable
  extends Omit<Table, "db" | "fields" | "segments" | "metrics" | "schema"> {
  db?: DatabaseId;
  fields?: FieldId[];
  segments?: SegmentId[];
  metrics?: MetricId[];
  schema?: SchemaId;
}

export interface NormalizedFieldDimension
  extends Omit<FieldDimension, "human_readable_field"> {
  human_readable_field?: FieldId;
}

export interface NormalizedField
  extends Omit<Field, "target" | "table" | "name_field" | "dimensions"> {
  target?: FieldId;
  table?: TableId;
  name_field?: FieldId;
  dimensions?: NormalizedFieldDimension;
}

export interface NormalizedSegment extends Omit<Segment, "table"> {
  table?: TableId;
}

export interface NormalizedMetric extends Omit<Metric, "table"> {
  table?: TableId;
}

export interface NormalizedTimeline
  extends Omit<Timeline, "collection" | "events"> {
  collection?: CollectionId;
  events?: TimelineEventId[];
}

export interface NormalizedCollection extends Omit<Collection, "items"> {
  items?: CollectionItemId[];
}
