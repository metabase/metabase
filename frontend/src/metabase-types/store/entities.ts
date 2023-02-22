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
  NativeQuerySnippet,
  NativeQuerySnippetId,
  Table,
  User,
  UserId,
  WritebackAction,
  WritebackActionId,
} from "metabase-types/api";

export interface EntitiesState {
  actions?: Record<WritebackActionId, WritebackAction>;
  collections?: Record<CollectionId, Collection>;
  dashboards?: Record<DashboardId, Dashboard>;
  databases?: Record<number, Database>;
  fields?: Record<FieldId, Field>;
  tables?: Record<number | string, Table>;
  snippets?: Record<NativeQuerySnippetId, NativeQuerySnippet>;
  users?: Record<UserId, User>;
  questions?: Record<CardId, Card>;
}
