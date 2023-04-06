import {
  Card,
  Collection,
  Dashboard,
  Database,
  Field,
  IndexedEntity,
  Metric,
  ModelIndex,
  NativeQuerySnippet,
  Schema,
  Segment,
  Table,
  User,
  WritebackAction,
} from "metabase-types/api";

export interface EntitiesState {
  actions: Record<string, WritebackAction>;
  collections: Record<string, Collection>;
  dashboards: Record<string, Dashboard>;
  databases: Record<string, Database>;
  schemas: Record<string, Schema>;
  tables: Record<string, Table>;
  modelIndexes: Record<string, ModelIndex>;
  indexedEntities: Record<string, IndexedEntity>;
  fields: Record<string, Field>;
  segments: Record<string, Segment>;
  metrics: Record<string, Metric>;
  snippets: Record<string, NativeQuerySnippet>;
  users: Record<string, User>;
  questions: Record<string, Card>;
}
