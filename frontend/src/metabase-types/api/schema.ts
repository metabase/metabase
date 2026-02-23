import type { WritebackAction } from "./actions";
import type { Card, CardId } from "./card";
import type { Collection, CollectionId, CollectionItemId } from "./collection";
import type { Dashboard } from "./dashboard";
import type { Database, DatabaseId } from "./database";
import type { Document } from "./document";
import type { Field, FieldDimension, FieldId } from "./field";
import type { Measure, MeasureId } from "./measure";
import type { Metric } from "./metric";
import type { Segment, SegmentId } from "./segment";
import type { NativeQuerySnippet } from "./snippets";
import type {
  ForeignKey,
  Schema,
  SchemaId,
  SchemaName,
  Table,
  TableId,
} from "./table";
import type { Timeline, TimelineEventId } from "./timeline";

export type NormalizedWritebackAction = WritebackAction;
export type NormalizedDashboard = Dashboard;
export type NormalizedDocument = Document;
export type NormalizedCard = Card;
export type NormalizedNativeQuerySnippet = NativeQuerySnippet;

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
  extends Omit<
    Table,
    "db" | "fields" | "fks" | "segments" | "measures" | "metrics" | "schema"
  > {
  db?: DatabaseId;
  fields?: FieldId[];
  fks?: NormalizedForeignKey[];
  segments?: SegmentId[];
  measures?: MeasureId[];
  metrics?: CardId[];
  schema?: SchemaId;
  schema_name?: SchemaName;
  original_fields?: Field[];
}

export interface NormalizedForeignKey
  extends Omit<ForeignKey, "origin" | "destination"> {
  origin?: FieldId;
  destination?: FieldId;
}

export interface NormalizedFieldDimension
  extends Omit<FieldDimension, "human_readable_field"> {
  human_readable_field?: FieldId;
}

export interface NormalizedField
  extends Omit<Field, "target" | "table" | "name_field" | "dimensions"> {
  uniqueId: string;
  target?: FieldId;
  table?: TableId;
  name_field?: FieldId;
  dimensions?: NormalizedFieldDimension;
}

export interface NormalizedSegment extends Omit<Segment, "table"> {
  table?: TableId;
}

export interface NormalizedMeasure extends Omit<Measure, "table"> {
  table?: TableId;
}

export interface NormalizedMetric extends Omit<Metric, "collection"> {
  collection?: CollectionId;
}

export interface NormalizedTimeline
  extends Omit<Timeline, "collection" | "events"> {
  collection?: CollectionId;
  events?: TimelineEventId[];
}

export interface NormalizedCollection extends Omit<Collection, "items"> {
  items?: CollectionItemId[];
}
