import { WritebackAction } from "./actions";
import { Alert } from "./alert";
import { Database, DatabaseId } from "./database";
import { Card } from "./card";
import { Collection, CollectionId, CollectionItemId } from "./collection";
import { Dashboard } from "./dashboard";
import { Field, FieldDimension, FieldId } from "./field";
import { Metric, MetricId } from "./metric";
import { Segment, SegmentId } from "./segment";
import { NativeQuerySnippet } from "./snippets";
import { ForeignKey, Schema, SchemaId, Table, TableId } from "./table";
import { Timeline, TimelineEventId } from "./timeline";
import { User } from "./user";

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
  schema_name?: string;
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
