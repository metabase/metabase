import type { TagDescription } from "@reduxjs/toolkit/query";

import { isVirtualDashCard } from "metabase/dashboard/utils";
import type {
  Alert,
  ApiKey,
  Bookmark,
  Card,
  CardId,
  CardQueryMetadata,
  Collection,
  CollectionItem,
  CollectionItemModel,
  Comment,
  Dashboard,
  DashboardQueryMetadata,
  DashboardSubscription,
  Database,
  DatabaseXray,
  Field,
  FieldDimension,
  FieldId,
  ForeignKey,
  GetUserKeyValueRequest,
  Group,
  GroupListQuery,
  LoggerPreset,
  Measure,
  MeasureId,
  Metric,
  MetricId,
  ModelCacheRefreshStatus,
  ModelIndex,
  NativeQuerySnippet,
  NotificationChannel,
  ParameterId,
  PopularItem,
  RecentItem,
  Revision,
  SearchModel,
  SearchResult,
  Segment,
  Table,
  Task,
  TaskRun,
  Timeline,
  TimelineEvent,
  UserInfo,
  WritebackAction,
} from "metabase-types/api";
import {
  ACTIVITY_MODELS,
  COLLECTION_ITEM_MODELS,
  SEARCH_MODELS,
} from "metabase-types/api";
import type { CloudMigration } from "metabase-types/api/cloud-migration";
import type { Notification } from "metabase-types/api/notification";

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

export function provideActionListTags(
  actions: WritebackAction[],
): TagDescription<TagType>[] {
  return [listTag("action"), ...actions.flatMap(provideActionTags)];
}

export function provideActionTags(
  action: WritebackAction,
): TagDescription<TagType>[] {
  return [idTag("action", action.id)];
}

export function provideActivityItemListTags(
  items: RecentItem[] | PopularItem[],
): TagDescription<TagType>[] {
  return [
    ...ACTIVITY_MODELS.map((model) => listTag(TAG_TYPE_MAPPING[model])),
    ...items.flatMap(provideActivityItemTags),
  ];
}

export function provideActivityItemTags(
  item: RecentItem | PopularItem,
): TagDescription<TagType>[] {
  return [idTag(TAG_TYPE_MAPPING[item.model], item.id)];
}

export function provideAdhocDatasetTags(): TagDescription<TagType>[] {
  return [tag("dataset")];
}

export function provideAdhocQueryMetadataTags(
  metadata: CardQueryMetadata,
): TagDescription<TagType>[] {
  return [
    ...provideAdhocDatasetTags(),
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

export function provideAutocompleteSuggestionListTags(): TagDescription<TagType>[] {
  return [listTag("table"), listTag("field")];
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

export function provideCardAutocompleteSuggestionListTags(): TagDescription<TagType>[] {
  return [listTag("card")];
}

export function provideCardListTags(cards: Card[]): TagDescription<TagType>[] {
  return [listTag("card"), ...cards.flatMap((card) => provideCardTags(card))];
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

export function provideCardQueryTags(
  cardId: CardId,
): TagDescription<TagType>[] {
  return [idTag("card", cardId)];
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
    ...models.map((model) => listTag(TAG_TYPE_MAPPING[model])),
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
    ...collections.flatMap((collection) => provideCollectionTags(collection)),
  ];
}

export function provideCollectionTags(
  collection: Collection,
): TagDescription<TagType>[] {
  return [idTag("collection", collection.id)];
}

export function provideLoggerPresetListTags(
  presets: LoggerPreset[],
): TagDescription<TagType>[] {
  return [
    listTag("logger-preset"),
    ...presets.flatMap(provideLoggerPresetTags),
  ];
}

export function provideLoggerPresetTags(
  preset: LoggerPreset,
): TagDescription<TagType>[] {
  return [idTag("logger-preset", preset.id)];
}

export function provideModelIndexTags(
  modelIndex: ModelIndex,
): TagDescription<TagType>[] {
  return [idTag("model-index", modelIndex.id)];
}

export function provideModelIndexListTags(
  modelIndexes: ModelIndex[],
): TagDescription<TagType>[] {
  return [
    listTag("model-index"),
    ...modelIndexes.flatMap((modelIndex) => provideModelIndexTags(modelIndex)),
  ];
}

export function provideModeratedItemTags(
  itemType: TagType,
  itemId: number,
): TagDescription<TagType>[] {
  return [listTag(itemType), idTag(itemType, itemId)];
}

export function provideChannelTags(
  channel: NotificationChannel,
): TagDescription<TagType>[] {
  return [idTag("channel", channel.id)];
}

export function provideChannelListTags(
  channels: NotificationChannel[],
): TagDescription<TagType>[] {
  return [
    listTag("channel"),
    ...channels.flatMap((channel) => provideChannelTags(channel)),
  ];
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
    ...(database.router_database_id
      ? [idTag("database", database.router_database_id)]
      : []),
    ...(database.tables ? provideTableListTags(database.tables) : []),
  ];
}

export function provideDashboardListTags(
  dashboards: Pick<Dashboard, "id">[],
): TagDescription<TagType>[] {
  return [
    listTag("dashboard"),
    ...dashboards.map((dashboard) => idTag("dashboard", dashboard.id)),
  ];
}

export function provideParameterValuesTags(
  parameterId: ParameterId,
): TagDescription<TagType>[] {
  return [idTag("parameter-values", parameterId)];
}

export function provideDashboardTags(
  dashboard: Dashboard,
): TagDescription<TagType>[] {
  const cards = dashboard.dashcards
    .flatMap((dashcard) => (isVirtualDashCard(dashcard) ? [] : [dashcard]))
    .map((dashcard) => dashcard.card);

  return [
    idTag("dashboard", dashboard.id),
    ...provideCardListTags(cards),
    ...(dashboard.collection
      ? provideCollectionTags(dashboard.collection)
      : []),
  ];
}

export function provideValidDashboardFilterFieldTags(
  filteredIds: FieldId[],
  filteringIds: FieldId[],
): TagDescription<TagType>[] {
  return [...filteredIds, ...filteringIds].map((fieldId) =>
    idTag("field", fieldId),
  );
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

export function provideRemappedFieldValuesTags(
  id: FieldId,
  searchFieldId: FieldId,
): TagDescription<TagType>[] {
  return [
    ...provideFieldValuesTags(id),
    ...provideFieldValuesTags(searchFieldId),
  ];
}

export function provideNotificationListTags(
  notifications: Notification[],
): TagDescription<TagType>[] {
  return [
    listTag("notification"),
    ...notifications.flatMap(provideNotificationTags),
  ];
}

export function provideNotificationTags(
  notification: Notification,
): TagDescription<TagType>[] {
  return [
    idTag("notification", notification.id),
    ...(notification.creator ? provideUserTags(notification.creator) : []),
  ];
}

export function providePermissionsGroupListTags(
  groups: GroupListQuery[],
): TagDescription<TagType>[] {
  return [
    listTag("permissions-group"),
    ...groups.flatMap(providePermissionsGroupListQueryTags),
  ];
}

export function providePermissionsGroupListQueryTags(
  group: GroupListQuery,
): TagDescription<TagType>[] {
  return [idTag("permissions-group", group.id)];
}

export function providePermissionsGroupTags(
  group: Group,
): TagDescription<TagType>[] {
  return [
    idTag("permissions-group", group.id),
    ...group.members.map((member) => idTag("user", member.user_id)),
  ];
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
 * because the model cache refresh lives on the card api `/api/persist/card/:id/refresh`.
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
    ...models.map((model) => listTag(TAG_TYPE_MAPPING[model])),
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

export function provideMeasureListTags(
  measures: Measure[],
): TagDescription<TagType>[] {
  return [listTag("measure"), ...measures.flatMap(provideMeasureTags)];
}

export function provideMeasureTags(
  measure: Measure,
): TagDescription<TagType>[] {
  return [
    idTag("measure", measure.id),
    ...(measure.table ? provideTableTags(measure.table) : []),
  ];
}

export function provideMeasureDimensionValuesTags(
  measureId: MeasureId,
): TagDescription<TagType>[] {
  return [idTag("measure", measureId)];
}

export function provideMetricListTags(
  metrics: Metric[],
): TagDescription<TagType>[] {
  return [listTag("card"), ...metrics.flatMap(provideMetricTags)];
}

export function provideMetricTags(metric: Metric): TagDescription<TagType>[] {
  return [
    idTag("card", metric.id),
    ...(metric.collection ? provideCollectionTags(metric.collection) : []),
  ];
}

export function provideMetricDimensionValuesTags(
  metricId: MetricId,
): TagDescription<TagType>[] {
  return [idTag("card", metricId)];
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

export function provideSubscriptionChannelListTags(): TagDescription<TagType>[] {
  return [listTag("subscription-channel")];
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
    ...(table.measures ? provideMeasureListTags(table.measures) : []),
    ...(table.metrics ? provideCardListTags(table.metrics) : []),
  ];
}

export function provideTaskListTags(tasks: Task[]): TagDescription<TagType>[] {
  return [listTag("task"), ...tasks.flatMap(provideTaskTags)];
}

export function provideUniqueTasksListTags(): TagDescription<TagType>[] {
  return [listTag("unique-tasks")];
}

export function provideTaskTags(task: Task): TagDescription<TagType>[] {
  return [idTag("task", task.id)];
}

export function provideTaskRunListTags(
  taskRuns: TaskRun[],
): TagDescription<TagType>[] {
  return [listTag("task-run"), ...taskRuns.flatMap(provideTaskRunTags)];
}

export function provideTaskRunTags(
  taskRun: TaskRun,
): TagDescription<TagType>[] {
  return [idTag("task-run", taskRun.id)];
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
  users: Pick<UserInfo, "id">[],
): TagDescription<TagType>[] {
  return [listTag("user"), ...users.flatMap((user) => provideUserTags(user))];
}

export function provideUserTags(
  user: Pick<UserInfo, "id">,
): TagDescription<TagType>[] {
  return [idTag("user", user.id)];
}

export function provideUserKeyValueTags({
  namespace,
  key,
}: GetUserKeyValueRequest) {
  return [{ type: "user-key-value" as const, id: `${namespace}#${key}` }];
}

export function provideCommentListTags(
  comments: Comment[],
): TagDescription<TagType>[] {
  return [listTag("comment"), ...comments.flatMap(provideCommentTags)];
}

export function provideCommentTags(
  comment: Comment,
): TagDescription<TagType>[] {
  if (comment.creator) {
    return [idTag("comment", comment.id), ...provideUserTags(comment.creator)];
  }

  return [idTag("comment", comment.id)];
}
