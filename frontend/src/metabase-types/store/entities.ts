import {
  Card,
  Collection,
  Dashboard,
  Database,
  DatabaseId,
  Field,
  FieldId,
  NativeQuerySnippet,
  Schema,
  SchemaId,
  Table,
  TableId,
  User,
  WritebackAction,
} from "metabase-types/api";

export interface NormalizedDatabase extends Omit<Database, "tables"> {
  tables?: TableId[];
  schemas?: SchemaId[];
}

export interface NormalizedSchema extends Schema {
  database?: DatabaseId;
  tables?: TableId[];
}

export interface NormalizedTable
  extends Omit<Table, "db" | "fields" | "schema"> {
  db?: DatabaseId;
  fields?: FieldId[];
  schema?: SchemaId;
}

export interface NormalizedField extends Omit<Field, "target" | "name_field"> {
  table?: TableId;
  target?: FieldId;
  name_field?: FieldId;
  uniqueId: string;
}

export interface EntitiesState {
  actions?: Record<string, WritebackAction>;
  collections?: Record<string, Collection>;
  dashboards?: Record<string, Dashboard>;
  databases?: Record<string, NormalizedDatabase>;
  tables?: Record<string, NormalizedTable>;
  fields?: Record<string, NormalizedField>;
  snippets?: Record<string, NativeQuerySnippet>;
  users?: Record<string, User>;
  questions?: Record<string, Card>;
}
