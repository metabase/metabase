import type { TagDescription } from "@reduxjs/toolkit/query";

import type {
  Collection,
  Database,
  Field,
  FieldDimension,
  Segment,
  Table,
  Timeline,
  TimelineEvent,
  UserInfo,
} from "metabase-types/api";

export const TAG_TYPES = [
  "action",
  "api-key",
  "card",
  "collection",
  "dashboard",
  "database",
  "field",
  "field-values",
  "indexed-entity",
  "metric",
  "schema",
  "snippet",
  "segment",
  "table",
  "timeline",
  "timeline-event",
  "user",
] as const;

export const MODEL_TO_TAG_TYPE = {
  collection: "collection",
  card: "card",
  dashboard: "dashboard",
  database: "database",
  "indexed-entity": "indexed-entity",
  table: "table",
  dataset: "card",
  action: "action",
  segment: "segment",
  metric: "metric",
  snippet: "snippet",
} as const;

export type TagType = typeof TAG_TYPES[number];

export function tag(type: TagType): TagDescription<TagType> {
  return { type };
}

export function listTag(type: TagType): TagDescription<TagType> {
  return { type, id: "LIST" };
}

export function idTag(
  type: TagType,
  id: string | number,
): TagDescription<TagType> {
  return { type, id };
}

export function invalidateTags(
  error: unknown,
  tags: TagDescription<TagType>[],
): TagDescription<TagType>[] {
  return !error ? tags : [];
}

export function databaseTags(database: Database): TagDescription<TagType>[] {
  return [
    idTag("database", database.id),
    ...(database.tables ? tableListTags(database.tables) : []),
  ];
}

export function tableTags(table: Table): TagDescription<TagType>[] {
  return [
    idTag("table", table.id),
    ...(table.db ? [idTag("database", table.db.id)] : []),
    ...(table.fields ? [listTag("field")] : []),
    ...(table.fks ? [listTag("field")] : []),
    ...(table.segments ? [listTag("segment")] : []),
    ...(table.metrics ? [listTag("metric")] : []),
  ];
}

export function tableListTags(tables: Table[]): TagDescription<TagType>[] {
  return [listTag("table"), ...tables.flatMap(tableTags)];
}

export function fieldTags(field: Field): TagDescription<TagType>[] {
  return [
    ...(typeof field.id === "number" ? [idTag("field", field.id)] : []),
    ...(field.target ? fieldTags(field.target) : []),
    ...(field.table ? [idTag("table", field.table.id)] : []),
    ...(field.name_field ? fieldTags(field.name_field) : []),
    ...(field.dimensions ? fieldDimensionListTags(field.dimensions) : []),
  ];
}

export function fieldListTags(fields: Field[]): TagDescription<TagType>[] {
  return [listTag("field"), ...fields.flatMap(fieldTags)];
}

export function fieldDimensionTags(
  dimension: FieldDimension,
): TagDescription<TagType>[] {
  return [
    ...(dimension.human_readable_field
      ? fieldTags(dimension.human_readable_field)
      : []),
  ];
}

export function fieldDimensionListTags(
  dimensions: FieldDimension[],
): TagDescription<TagType>[] {
  return dimensions.flatMap(fieldDimensionTags);
}

export function segmentTags(segment: Segment): TagDescription<TagType>[] {
  return [
    idTag("segment", segment.id),
    ...(segment.table ? tableTags(segment.table) : []),
  ];
}

export function segmentListTags(
  segments: Segment[],
): TagDescription<TagType>[] {
  return [listTag("segment"), ...segments.flatMap(segmentTags)];
}

export function collectionTags(
  collection: Collection,
): TagDescription<TagType>[] {
  return [idTag("collection", collection.id)];
}

export function userTags(user: UserInfo): TagDescription<TagType>[] {
  return [idTag("user", user.id)];
}

export function timelineTags(timeline: Timeline): TagDescription<TagType>[] {
  return [
    idTag("timeline", timeline.id),
    ...(timeline.collection ? collectionTags(timeline.collection) : []),
    ...(timeline.events ? timelineEventListTags(timeline.events) : []),
  ];
}

export function timelineEventTags(
  event: TimelineEvent,
): TagDescription<TagType>[] {
  return [
    idTag("timeline-event", event.id),
    ...(event.creator ? userTags(event.creator) : []),
  ];
}

export function timelineEventListTags(
  events: TimelineEvent[],
): TagDescription<TagType>[] {
  return [listTag("timeline-event"), ...events.flatMap(timelineEventTags)];
}
