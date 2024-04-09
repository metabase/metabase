import type { TagDescription } from "@reduxjs/toolkit/query";

import type {
  ApiKey,
  Card,
  Collection,
  Database,
  Field,
  FieldDimension,
  FieldId,
  ForeignKey,
  Metric,
  PopularItem,
  RecentItem,
  Segment,
  Table,
  Timeline,
  TimelineEvent,
  UserInfo,
} from "metabase-types/api";

import type { TagType } from "./constants";
import { MODEL_TO_TAG_TYPE, MODEL_TYPES } from "./constants";

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

export function activityItemListTags(
  items: RecentItem[] | PopularItem[],
): TagDescription<TagType>[] {
  return [
    ...MODEL_TYPES.map(type => listTag(MODEL_TO_TAG_TYPE[type])),
    ...items.flatMap(activityItemTags),
  ];
}

export function activityItemTags(
  item: RecentItem | PopularItem,
): TagDescription<TagType>[] {
  return [idTag(MODEL_TO_TAG_TYPE[item.model], item.model_id)];
}

export function apiKeyListTags(apiKeys: ApiKey[]): TagDescription<TagType>[] {
  return [listTag("api-key"), ...apiKeys.flatMap(apiKeyTags)];
}

export function apiKeyTags(apiKey: ApiKey): TagDescription<TagType>[] {
  return [idTag("api-key", apiKey.id)];
}

export function databaseListTags(
  databases: Database[],
): TagDescription<TagType>[] {
  return [listTag("database"), ...databases.flatMap(databaseTags)];
}

export function databaseTags(database: Database): TagDescription<TagType>[] {
  return [
    idTag("database", database.id),
    ...(database.tables ? tableListTags(database.tables) : []),
  ];
}

export function cardListTags(cards: Card[]): TagDescription<TagType>[] {
  return [listTag("card"), ...cards.flatMap(card => cardTags(card))];
}

export function cardTags(card: Card): TagDescription<TagType>[] {
  return [idTag("card", card.id)];
}

export function collectionTags(
  collection: Collection,
): TagDescription<TagType>[] {
  return [idTag("collection", collection.id)];
}

export function fieldListTags(fields: Field[]): TagDescription<TagType>[] {
  return [listTag("field"), ...fields.flatMap(fieldTags)];
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

export function foreignKeyListTags(
  foreignKeys: ForeignKey[],
): TagDescription<TagType>[] {
  return [listTag("field"), ...foreignKeys.flatMap(foreignKeyTags)];
}

export function foreignKeyTags(
  foreignKey: ForeignKey,
): TagDescription<TagType>[] {
  return [
    ...(foreignKey.origin ? fieldTags(foreignKey.origin) : []),
    ...(foreignKey.destination ? fieldTags(foreignKey.destination) : []),
  ];
}

export function fieldDimensionListTags(
  dimensions: FieldDimension[],
): TagDescription<TagType>[] {
  return dimensions.flatMap(fieldDimensionTags);
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

export function fieldValuesTags(id: FieldId): TagDescription<TagType>[] {
  return [idTag("field-values", id)];
}

export function metricListTags(metrics: Metric[]): TagDescription<TagType>[] {
  return [listTag("metric"), ...metrics.flatMap(metricTags)];
}

export function metricTags(metric: Metric): TagDescription<TagType>[] {
  return [
    idTag("metric", metric.id),
    ...(metric.table ? tableTags(metric.table) : []),
  ];
}

export function segmentListTags(
  segments: Segment[],
): TagDescription<TagType>[] {
  return [listTag("segment"), ...segments.flatMap(segmentTags)];
}

export function segmentTags(segment: Segment): TagDescription<TagType>[] {
  return [
    idTag("segment", segment.id),
    ...(segment.table ? tableTags(segment.table) : []),
  ];
}

export function tableListTags(tables: Table[]): TagDescription<TagType>[] {
  return [listTag("table"), ...tables.flatMap(tableTags)];
}

export function tableTags(table: Table): TagDescription<TagType>[] {
  return [
    idTag("table", table.id),
    ...(table.db ? databaseTags(table.db) : []),
    ...(table.fields ? fieldListTags(table.fields) : []),
    ...(table.fks ? foreignKeyListTags(table.fks) : []),
    ...(table.segments ? segmentListTags(table.segments) : []),
    ...(table.metrics ? metricListTags(table.metrics) : []),
  ];
}

export function timelineEventListTags(
  events: TimelineEvent[],
): TagDescription<TagType>[] {
  return [listTag("timeline-event"), ...events.flatMap(timelineEventTags)];
}

export function timelineEventTags(
  event: TimelineEvent,
): TagDescription<TagType>[] {
  return [
    idTag("timeline-event", event.id),
    ...(event.creator ? userTags(event.creator) : []),
  ];
}

export function timelineListTags(
  timelines: Timeline[],
): TagDescription<TagType>[] {
  return [listTag("timeline"), ...timelines.flatMap(timelineTags)];
}

export function timelineTags(timeline: Timeline): TagDescription<TagType>[] {
  return [
    idTag("timeline", timeline.id),
    ...(timeline.collection ? collectionTags(timeline.collection) : []),
    ...(timeline.events ? timelineEventListTags(timeline.events) : []),
  ];
}

export function userTags(user: UserInfo): TagDescription<TagType>[] {
  return [idTag("user", user.id)];
}

///
