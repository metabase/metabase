import { normalize } from "normalizr";
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
  Segment,
  WritebackAction,
} from "metabase-types/api";
import { EntitiesState } from "metabase-types/store";
import { createMockEntitiesState } from "metabase-types/store/mocks";

const EntitiesSchema = {
  actions: [ActionSchema],
  collections: [CollectionSchema],
  dashboards: [DashboardSchema],
  databases: [DatabaseSchema],
  tables: [TableSchema],
  fields: [FieldSchema],
  metrics: [MetricSchema],
  segments: [SegmentSchema],
  snippets: [SnippetSchema],
  users: [UserSchema],
  questions: [QuestionSchema],
};

export interface EntitiesStateOpts {
  actions?: WritebackAction[];
  collections?: Collection[];
  dashboards?: Dashboard[];
  databases?: Database[];
  tables?: Table[];
  fields?: Field[];
  metrics?: Metric[];
  segments?: Segment[];
  snippets?: NativeQuerySnippet[];
  users?: User[];
  questions?: Card[];
}

export const createEntitiesState = (opts: EntitiesStateOpts): EntitiesState => {
  const schema = normalize(opts, EntitiesSchema);
  return createMockEntitiesState(schema.entities);
};
