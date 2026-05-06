import type { Schema as NormalizrSchema } from "normalizr";
import { normalize } from "normalizr";

import type { EntitiesState } from "metabase/redux/store";
import { createMockNormalizedEntitiesState } from "metabase/redux/store/mocks";
import {
  ActionSchema,
  CollectionSchema,
  DashboardSchema,
  DatabaseSchema,
  FieldSchema,
  GroupSchema,
  MeasureSchema,
  MetricSchema,
  QuestionSchema,
  SchemaSchema,
  SegmentSchema,
  SnippetSchema,
  TableSchema,
} from "metabase/schema";
import type {
  Card,
  Collection,
  Dashboard,
  Database,
  Field,
  Measure,
  NativeQuerySnippet,
  SavedQuestionDatabase,
  Schema,
  Segment,
  Table,
  User,
  WritebackAction,
} from "metabase-types/api";

export interface EntitiesStateOpts {
  actions?: WritebackAction[];
  collections?: Collection[];
  dashboards?: Dashboard[];
  databases?: (Database | SavedQuestionDatabase)[];
  schemas?: Schema[];
  tables?: Table[];
  fields?: Field[];
  segments?: Segment[];
  measures?: Measure[];
  snippets?: NativeQuerySnippet[];
  users?: User[];
  questions?: Card[];
}

const EntitiesSchema: Record<keyof EntitiesState, NormalizrSchema<any>> = {
  actions: [ActionSchema],
  collections: [CollectionSchema],
  dashboards: [DashboardSchema],
  databases: [DatabaseSchema],
  schemas: [SchemaSchema],
  tables: [TableSchema],
  fields: [FieldSchema],
  segments: [SegmentSchema],
  measures: [MeasureSchema],
  metrics: [MetricSchema],
  snippets: [SnippetSchema],
  questions: [QuestionSchema],
  groups: [GroupSchema],
};

export const createMockEntitiesState = (
  opts: EntitiesStateOpts,
): EntitiesState => {
  const schema = normalize(opts, EntitiesSchema);
  return {
    ...createMockNormalizedEntitiesState(),
    ...schema.entities,
  };
};
