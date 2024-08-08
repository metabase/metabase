import type { WritebackAction } from "./actions";
import type { Alert } from "./alert";
import type { Card } from "./card";
import type { Collection, CollectionId, CollectionItemId } from "./collection";
import type { Dashboard } from "./dashboard";
import type { Database, DatabaseId } from "./database";
import type { Field, FieldDimension, FieldId } from "./field";
import type { Metric, MetricId } from "./metric";
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
import type { User } from "./user";

export type NormalizedWritebackAction = WritebackAction;
export type NormalizedAlert = Alert;
export type NormalizedDashboard = Dashboard;
export type NormalizedUser = User;
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
    "db" | "fields" | "fks" | "segments" | "metrics" | "schema"
  > {
  db?: DatabaseId;
  fields?: FieldId[];
  fks?: NormalizedForeignKey[];
  segments?: SegmentId[];
  metrics?: MetricId[];
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
