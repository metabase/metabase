import {
  Card,
  CardId,
  Collection,
  CollectionId,
  Dashboard,
  DashboardId,
  Database,
  Field,
  FieldId,
  Metric,
  NativeQuerySnippet,
  NativeQuerySnippetId,
  Segment,
  Table,
  User,
  UserId,
  WritebackAction,
  WritebackActionId,
} from "metabase-types/api";

export interface EntitiesState {
  actions?: Record<WritebackActionId, WritebackAction>;
  collections?: Partial<Record<CollectionId, Collection>>;
  dashboards?: Record<DashboardId, Dashboard>;
  databases?: Record<number, Database>;
  fields?: Record<FieldId, Field>;
  metrics?: Record<string, Metric>;
  tables?: Record<number | string, Table>;
  schemas?: Record<string, Table["schema"]>;
  segments: Record<string, Segment>;
  snippets?: Record<NativeQuerySnippetId, NativeQuerySnippet>;
  users?: Record<UserId, User>;
  questions?: Record<CardId, Card>;
}
