import type { TagDescription } from "@reduxjs/toolkit/query";

import { isVirtualDashCard } from "metabase/dashboard/utils";
import type {
  Alert,
  ApiKey,
  Bookmark,
  Card,
  Collection,
  CollectionItem,
  CollectionItemModel,
  Dashboard,
  DashboardSubscription,
  Database,
  DatabaseXray,
  Field,
  FieldDimension,
  FieldId,
  ForeignKey,
  GroupListQuery,
  ListDashboardsResponse,
  Metric,
  NativeQuerySnippet,
  ModelCacheRefreshStatus,
  PopularItem,
  RecentItem,
  Revision,
  SearchModel,
  SearchResult,
  Segment,
  Table,
  Task,
  Timeline,
  TimelineEvent,
  UserInfo,
  DashboardQueryMetadata,
  CardQueryMetadata,
  CardId,
} from "metabase-types/api";
import {
  ACTIVITY_MODELS,
  COLLECTION_ITEM_MODELS,
  SEARCH_MODELS,
} from "metabase-types/api";
import type { CloudMigration } from "metabase-types/api/cloud-migration";

import type { TagType } from "./constants";
import { TAG_TYPE_MAPPING } from "./constants";

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

// ----------------------------------------------------------------------- //
// Keep the below list of entity-specific functions alphabetically sorted. //
// ----------------------------------------------------------------------- //

export function provideActivityItemListTags(
  items: RecentItem[] | PopularItem[],
): TagDescription<TagType>[] {
  return [
    ...ACTIVITY_MODELS.map(model => listTag(TAG_TYPE_MAPPING[model])),
    ...items.flatMap(provideActivityItemTags),
  ];
}

export function provideActivityItemTags(
  item: RecentItem | PopularItem,
): TagDescription<TagType>[] {
  return [idTag(TAG_TYPE_MAPPING[item.model], item.id)];
}

export function provideAdhocQueryMetadataTags(
  metadata: CardQueryMetadata,
): TagDescription<TagType>[] {
  return [
    ...provideDatabaseListTags(metadata.databases),
    ...provideTableListTags(metadata.tables),
    ...provideFieldListTags(metadata.fields),
  ];
}

export function provideAlertListTags(
  alerts: Alert[],
): TagDescription<TagType>[] {
  return [listTag("alert"), ...alerts.flatMap(provideAlertTags)];
}

export function provideAlertTags(alert: Alert): TagDescription<TagType>[] {
  return [
    idTag("alert", alert.id),
    ...(alert.creator ? provideUserTags(alert.creator) : []),
  ];
}

export function provideApiKeyListTags(
  apiKeys: ApiKey[],
): TagDescription<TagType>[] {
  return [listTag("api-key"), ...apiKeys.flatMap(provideApiKeyTags)];
}

export function provideApiKeyTags(apiKey: ApiKey): TagDescription<TagType>[] {
  return [idTag("api-key", apiKey.id)];
}

export function provideBookmarkListTags(
  bookmarks: Bookmark[],
): TagDescription<TagType>[] {
  return [listTag("bookmark"), ...bookmarks.flatMap(provideBookmarkTags)];
}

export function provideBookmarkTags(
  bookmark: Bookmark,
): TagDescription<TagType>[] {
  return [
    idTag("bookmark", bookmark.id),
    idTag(TAG_TYPE_MAPPING[bookmark.type], bookmark.item_id),
  ];
}

export function provideCardListTags(cards: Card[]): TagDescription<TagType>[] {
  return [listTag("card"), ...cards.flatMap(card => provideCardTags(card))];
}

export function provideCardTags(card: Card): TagDescription<TagType>[] {
  return [
    idTag("card", card.id),
    ...(card.collection ? provideCollectionTags(card.collection) : []),
  ];
}

export function provideCardQueryMetadataTags(
  id: CardId,
  metadata: CardQueryMetadata,
): TagDescription<TagType>[] {
  return [idTag("card", id), ...provideAdhocQueryMetadataTags(metadata)];
}

export function provideCloudMigrationTags(
  migration: CloudMigration,
): TagDescription<TagType>[] {
  return [idTag("cloud-migration", migration.id)];
}

export function provideCollectionItemListTags(
  items: CollectionItem[],
  models: CollectionItemModel[] = Array.from(COLLECTION_ITEM_MODELS),
): TagDescription<TagType>[] {
  return [
    ...models.map(model => listTag(TAG_TYPE_MAPPING[model])),
    ...items.flatMap(provideCollectionItemTags),
  ];
}

export function provideCollectionItemTags(
  item: CollectionItem,
): TagDescription<TagType>[] {
  return [idTag(TAG_TYPE_MAPPING[item.model], item.id)];
}

export function provideCollectionListTags(
  collections: Collection[],
): TagDescription<TagType>[] {
  return [
    listTag("collection"),
    ...collections.flatMap(collection => provideCollectionTags(collection)),
  ];
}

export function provideCollectionTags(
  collection: Collection,
): TagDescription<TagType>[] {
  return [idTag("collection", collection.id)];
}

export function provideDatabaseCandidateListTags(
  candidates: DatabaseXray[],
): TagDescription<TagType>[] {
  return [
    listTag("schema"),
    ...candidates.flatMap(provideDatabaseCandidateTags),
  ];
}

export function provideDatabaseCandidateTags(
  candidate: DatabaseXray,
): TagDescription<TagType>[] {
  return [idTag("schema", candidate.schema)];
}

export function provideDatabaseListTags(
  databases: Database[],
): TagDescription<TagType>[] {
  return [listTag("database"), ...databases.flatMap(provideDatabaseTags)];
}

export function provideDatabaseTags(
  database: Database,
): TagDescription<TagType>[] {
  return [
    idTag("database", database.id),
    ...(database.tables ? provideTableListTags(database.tables) : []),
  ];
}

export function provideDashboardListTags(
  dashboards: ListDashboardsResponse,
): TagDescription<TagType>[] {
  return [
    listTag("dashboard"),
    ...dashboards.map(dashboard => idTag("dashboard", dashboard.id)),
  ];
}

export function provideDashboardTags(
  dashboard: Dashboard,
): TagDescription<TagType>[] {
  const cards = dashboard.dashcards
    .flatMap(dashcard => (isVirtualDashCard(dashcard) ? [] : [dashcard]))
    .map(dashcard => dashcard.card);

  return [
    idTag("dashboard", dashboard.id),
    ...provideCardListTags(cards),
    ...(dashboard.collection
      ? provideCollectionTags(dashboard.collection)
      : []),
  ];
}

export function provideDashboardQueryMetadataTags(
  metadata: DashboardQueryMetadata,
): TagDescription<TagType>[] {
  return [
    ...provideDatabaseListTags(metadata.databases),
    ...provideTableListTags(metadata.tables),
    ...provideFieldListTags(metadata.fields),
    ...provideCardListTags(metadata.cards),
    ...provideDashboardListTags(metadata.dashboards),
  ];
}

export function provideFieldListTags(
  fields: Field[],
): TagDescription<TagType>[] {
  return [listTag("field"), ...fields.flatMap(provideFieldTags)];
}

export function provideFieldTags(field: Field): TagDescription<TagType>[] {
  return [
    ...(typeof field.id === "number" ? [idTag("field", field.id)] : []),
    ...(field.target ? provideFieldTags(field.target) : []),
    ...(field.table ? [idTag("table", field.table.id)] : []),
    ...(field.name_field ? provideFieldTags(field.name_field) : []),
    ...(field.dimensions
      ? provideFieldDimensionListTags(field.dimensions)
      : []),
  ];
}

export function provideForeignKeyListTags(
  foreignKeys: ForeignKey[],
): TagDescription<TagType>[] {
  return [listTag("field"), ...foreignKeys.flatMap(provideForeignKeyTags)];
}

export function provideForeignKeyTags(
  foreignKey: ForeignKey,
): TagDescription<TagType>[] {
  return [
    ...(foreignKey.origin ? provideFieldTags(foreignKey.origin) : []),
    ...(foreignKey.destination ? provideFieldTags(foreignKey.destination) : []),
  ];
}

export function provideFieldDimensionListTags(
  dimensions: FieldDimension[],
): TagDescription<TagType>[] {
  return dimensions.flatMap(provideFieldDimensionTags);
}

export function provideFieldDimensionTags(
  dimension: FieldDimension,
): TagDescription<TagType>[] {
  return [
    ...(dimension.human_readable_field
      ? provideFieldTags(dimension.human_readable_field)
      : []),
  ];
}

export function provideFieldValuesTags(id: FieldId): TagDescription<TagType>[] {
  return [idTag("field-values", id)];
}

export function provideMetricListTags(
  metrics: Metric[],
): TagDescription<TagType>[] {
  return [listTag("metric"), ...metrics.flatMap(provideMetricTags)];
}

export function provideMetricTags(metric: Metric): TagDescription<TagType>[] {
  return [
    idTag("metric", metric.id),
    ...(metric.table ? provideTableTags(metric.table) : []),
  ];
}

export function providePermissionsGroupListTags(
  groups: GroupListQuery[],
): TagDescription<TagType>[] {
  return [
    listTag("permissions-group"),
    ...groups.flatMap(providePermissionsGroupTags),
  ];
}

export function providePermissionsGroupTags(
  group: GroupListQuery,
): TagDescription<TagType>[] {
  return [idTag("permissions-group", group.id)];
}

export function providePersistedInfoListTags(
  statuses: ModelCacheRefreshStatus[],
): TagDescription<TagType>[] {
  return [
    listTag("persisted-info"),
    ...statuses.flatMap(providePersistedInfoTags),
  ];
}

export function providePersistedInfoTags(
  status: ModelCacheRefreshStatus,
): TagDescription<TagType>[] {
  return [idTag("persisted-info", status.id)];
}

/**
 * We have to differentiate between the `persisted-info` and `persisted-model` tags
 * because the model cache refresh lives on the card api `/api/card/model/:id/refresh`.
 * That endpoint doesn't have information about the persisted info id, so we have to
 * map the model id to the `card_id` on the ModelCacheRefreshStatus.
 */
export function providePersistedModelTags(
  status: ModelCacheRefreshStatus,
): TagDescription<TagType>[] {
  return [idTag("persisted-model", status.card_id)];
}

export function provideRevisionListTags(
  revisions: Revision[],
): TagDescription<TagType>[] {
  return [listTag("revision"), ...revisions.flatMap(provideRevisionTags)];
}

export function provideRevisionTags(
  revision: Revision,
): TagDescription<TagType>[] {
  return [idTag("revision", revision.id)];
}

export function provideSearchItemListTags(
  items: SearchResult[],
  models: SearchModel[] = Array.from(SEARCH_MODELS),
): TagDescription<TagType>[] {
  return [
    ...models.map(model => listTag(TAG_TYPE_MAPPING[model])),
    ...items.flatMap(provideSearchItemTags),
  ];
}

export function provideSearchItemTags(
  item: SearchResult,
): TagDescription<TagType>[] {
  return [
    idTag(TAG_TYPE_MAPPING[item.model], item.id),
    ...(item.collection ? [idTag("collection", item.collection.id)] : []),
  ];
}

export function provideSegmentListTags(
  segments: Segment[],
): TagDescription<TagType>[] {
  return [listTag("segment"), ...segments.flatMap(provideSegmentTags)];
}

export function provideSegmentTags(
  segment: Segment,
): TagDescription<TagType>[] {
  return [
    idTag("segment", segment.id),
    ...(segment.table ? provideTableTags(segment.table) : []),
  ];
}

export function provideSnippetListTags(
  snippets: NativeQuerySnippet[],
): TagDescription<TagType>[] {
  return [listTag("snippet"), ...snippets.flatMap(provideSnippetTags)];
}

export function provideSnippetTags(
  snippet: NativeQuerySnippet,
): TagDescription<TagType>[] {
  return [idTag("snippet", snippet.id)];
}

export function provideSubscriptionListTags(
  subscriptions: DashboardSubscription[],
): TagDescription<TagType>[] {
  return [
    listTag("subscription"),
    ...subscriptions.flatMap(provideSubscriptionTags),
  ];
}

export function provideSubscriptionTags(
  subscription: DashboardSubscription,
): TagDescription<TagType>[] {
  return [idTag("subscription", subscription.id)];
}

export function provideTableListTags(
  tables: Table[],
): TagDescription<TagType>[] {
  return [listTag("table"), ...tables.flatMap(provideTableTags)];
}

export function provideTableTags(table: Table): TagDescription<TagType>[] {
  return [
    idTag("table", table.id),
    ...(table.db ? provideDatabaseTags(table.db) : []),
    ...(table.fields ? provideFieldListTags(table.fields) : []),
    ...(table.fks ? provideForeignKeyListTags(table.fks) : []),
    ...(table.segments ? provideSegmentListTags(table.segments) : []),
    ...(table.metrics ? provideMetricListTags(table.metrics) : []),
  ];
}

export function provideTaskListTags(tasks: Task[]): TagDescription<TagType>[] {
  return [listTag("task"), ...tasks.flatMap(provideTaskTags)];
}

export function provideTaskTags(task: Task): TagDescription<TagType>[] {
  return [idTag("task", task.id)];
}

export function provideTimelineEventListTags(
  events: TimelineEvent[],
): TagDescription<TagType>[] {
  return [
    listTag("timeline-event"),
    ...events.flatMap(provideTimelineEventTags),
  ];
}

export function provideTimelineEventTags(
  event: TimelineEvent,
): TagDescription<TagType>[] {
  return [
    idTag("timeline-event", event.id),
    ...(event.creator ? provideUserTags(event.creator) : []),
  ];
}

export function provideTimelineListTags(
  timelines: Timeline[],
): TagDescription<TagType>[] {
  return [listTag("timeline"), ...timelines.flatMap(provideTimelineTags)];
}

export function provideTimelineTags(
  timeline: Timeline,
): TagDescription<TagType>[] {
  return [
    idTag("timeline", timeline.id),
    ...(timeline.collection ? provideCollectionTags(timeline.collection) : []),
    ...(timeline.events ? provideTimelineEventListTags(timeline.events) : []),
  ];
}

export function provideUserListTags(
  users: UserInfo[],
): TagDescription<TagType>[] {
  return [listTag("user"), ...users.flatMap(user => provideUserTags(user))];
}

export function provideUserTags(user: UserInfo): TagDescription<TagType>[] {
  return [idTag("user", user.id)];
}
