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
  Schema,
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
  schemas?: Record<string, Schema>;
  metrics?: Record<string, Metric>;
  fields?: Record<FieldId, Field>;
  tables?: Record<number | string, Table>;
  snippets?: Record<NativeQuerySnippetId, NativeQuerySnippet>;
  users?: Record<UserId, User>;
  questions?: Record<CardId, Card>;
}
