import {
  Card,
  Collection,
  Dashboard,
  Database,
  Field,
  FieldId,
  NativeQuerySnippet,
  Table,
  TableId,
  User,
  WritebackAction,
} from "metabase-types/api";

export interface NormalizedDatabase extends Omit<Database, "tables"> {
  tables?: TableId[];
}

export interface NormalizedTable extends Omit<Table, "fields"> {
  fields?: FieldId[];
}

export interface EntitiesState {
  actions?: Record<string, WritebackAction>;
  collections?: Record<string, Collection>;
  dashboards?: Record<string, Dashboard>;
  databases?: Record<string, NormalizedDatabase>;
  tables?: Record<string, NormalizedTable>;
  fields?: Record<string, Field>;
  snippets?: Record<string, NativeQuerySnippet>;
  users?: Record<string, User>;
  questions?: Record<string, Card>;
}
