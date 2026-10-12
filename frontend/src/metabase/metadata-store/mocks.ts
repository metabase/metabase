import { type Schema as NormalizrSchema, normalize } from "normalizr";

import type { EntitiesState } from "metabase/redux/store";
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
} from "./schema";

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

const emptyEntitiesState = (): EntitiesState => ({
  databases: {},
  schemas: {},
  tables: {},
  fields: {},
  segments: {},
  measures: {},
  metrics: {},
  snippets: {},
  questions: {},
});

/**
 * A fixture of the mirror's normalized shape, built from plain API entities.
 *
 * It lives in the module because normalizing is what the schemas do, and they
 * are private. `__support__/store` re-exports it, which is where specs take it
 * from.
 */
export const createMockEntitiesState = (
  opts: EntitiesStateOpts,
): EntitiesState => ({
  ...emptyEntitiesState(),
  ...normalize(opts, EntitiesSchema).entities,
});
