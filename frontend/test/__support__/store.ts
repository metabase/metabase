import { normalize } from "normalizr";
import type { Schema as NormalizrSchema } from "normalizr";

import {
  ActionSchema,
  CollectionSchema,
  DashboardSchema,
  DatabaseSchema,
  FieldSchema,
  MetricSchema,
  QuestionSchema,
  SegmentSchema,
  SnippetSchema,
  SchemaSchema,
  TableSchema,
  UserSchema,
} from "metabase/schema";
import {
  Card,
  Collection,
  Dashboard,
  Database,
  Field,
  NativeQuerySnippet,
  Metric,
  Table,
  User,
  Schema,
  Segment,
  WritebackAction,
  Alert,
} from "metabase-types/api";
import { EntitiesState } from "metabase-types/store";

interface EntitiesStateOpts {
  actions?: WritebackAction[];
  alerts?: Alert[];
  collections?: Collection[];
  dashboards?: Dashboard[];
  databases?: Database[];
  schemas?: Schema[];
  tables?: Table[];
  fields?: Field[];
  metrics?: Metric[];
  segments?: Segment[];
  snippets?: NativeQuerySnippet[];
  users?: User[];
  questions?: Card[];
}

const EntitiesSchema: Record<keyof EntitiesState, NormalizrSchema<any>> = {
  actions: [ActionSchema],
  alerts: [],
  collections: [CollectionSchema],
  dashboards: [DashboardSchema],
  databases: [DatabaseSchema],
  schemas: [SchemaSchema],
  tables: [TableSchema],
  fields: [FieldSchema],
  metrics: [MetricSchema],
  segments: [SegmentSchema],
  snippets: [SnippetSchema],
  users: [UserSchema],
  questions: [QuestionSchema],
};

const EMPTY_STATE: EntitiesState = {
  actions: {},
  alerts: {},
  collections: {},
  dashboards: {},
  databases: {},
  schemas: {},
  tables: {},
  fields: {},
  metrics: {},
  segments: {},
  snippets: {},
  users: {},
  questions: {},
};

export const createEntitiesState = (opts: EntitiesStateOpts): EntitiesState => {
  const schema = normalize(opts, EntitiesSchema);
  return {
    ...EMPTY_STATE,
    ...schema.entities,
  };
};
