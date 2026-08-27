import type { Schema as NormalizrSchema } from "normalizr";
import { normalize } from "normalizr";

import type { EntitiesState } from "metabase/redux/store";
import { createMockNormalizedEntitiesState } from "metabase/redux/store/mocks";
import {
  DatabaseSchema,
  FieldSchema,
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
  Database,
  Field,
  Measure,
  NativeQuerySnippet,
  SavedQuestionDatabase,
  Schema,
  Segment,
  Table,
  User,
} from "metabase-types/api";

export interface EntitiesStateOpts {
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
  databases: [DatabaseSchema],
  schemas: [SchemaSchema],
  tables: [TableSchema],
  fields: [FieldSchema],
  segments: [SegmentSchema],
  measures: [MeasureSchema],
  metrics: [MetricSchema],
  snippets: [SnippetSchema],
  questions: [QuestionSchema],
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
