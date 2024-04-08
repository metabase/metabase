import type { TagDescription } from "@reduxjs/toolkit/query";

import type {
  Card,
  Collection,
  Database,
  Field,
  FieldDimension,
  FieldId,
  Metric,
  Segment,
  Table,
  Timeline,
  TimelineEvent,
  UserInfo,
} from "metabase-types/api";

import type { TagType } from "./types";

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

export function databaseTags(database: Database) {
  return [
    idTag("database", database.id),
    ...(database.tables ? tableListTags(database.tables) : []),
  ];
}

export function databaseListTags(databases: Database[]) {
  return [listTag("database"), ...databases.flatMap(databaseTags)];
}

export function tableTags(table: Table) {
  return [
    idTag("table", table.id),
    ...(table.db ? [idTag("database", table.db.id)] : []),
    ...(table.fields ? [listTag("field")] : []),
    ...(table.fks ? [listTag("field")] : []),
    ...(table.segments ? [listTag("segment")] : []),
    ...(table.metrics ? [listTag("metric")] : []),
  ];
}

export function tableListTags(tables: Table[]) {
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

export function fieldListTags(fields: Field[]) {
  return [listTag("field"), ...fields.flatMap(fieldTags)];
}

export function fieldValuesTags(id: FieldId) {
  return [idTag("field-values", id)];
}

export function fieldDimensionTags(dimension: FieldDimension) {
  return [
    ...(dimension.human_readable_field
      ? fieldTags(dimension.human_readable_field)
      : []),
  ];
}

export function fieldDimensionListTags(dimensions: FieldDimension[]) {
  return dimensions.flatMap(fieldDimensionTags);
}

export function segmentTags(segment: Segment) {
  return [
    idTag("segment", segment.id),
    ...(segment.table ? tableTags(segment.table) : []),
  ];
}

export function segmentListTags(segments: Segment[]) {
  return [listTag("segment"), ...segments.flatMap(segmentTags)];
}

export function metricTags(metric: Metric) {
  return [
    idTag("metric", metric.id),
    ...(metric.table ? tableTags(metric.table) : []),
  ];
}

export function cardTags(card: Card) {
  return [idTag("card", card.id)];
}

export function cardListTags(cards: Card[]) {
  return [listTag("card"), ...cards.flatMap(card => cardTags(card))];
}

export function metricListTags(metrics: Metric[]) {
  return [listTag("metric"), ...metrics.flatMap(metricTags)];
}

export function collectionTags(collection: Collection) {
  return [idTag("collection", collection.id)];
}

export function userTags(user: UserInfo) {
  return [idTag("user", user.id)];
}

export function timelineTags(timeline: Timeline) {
  return [
    idTag("timeline", timeline.id),
    ...(timeline.collection ? collectionTags(timeline.collection) : []),
    ...(timeline.events ? timelineEventListTags(timeline.events) : []),
  ];
}

export function timelineEventTags(event: TimelineEvent) {
  return [
    idTag("timeline-event", event.id),
    ...(event.creator ? userTags(event.creator) : []),
  ];
}

export function timelineEventListTags(events: TimelineEvent[]) {
  return [listTag("timeline-event"), ...events.flatMap(timelineEventTags)];
}
