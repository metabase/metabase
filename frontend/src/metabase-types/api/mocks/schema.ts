import {
  NormalizedDatabase,
  NormalizedSchema,
  NormalizedTable,
} from "metabase-types/api";
import { createMockDatabase } from "./database";
import { createMockSchema, createMockTable } from "./table";

export const createMockNormalizedDatabase = ({
  tables,
  schemas,
  ...opts
}: Partial<NormalizedDatabase> = {}): NormalizedDatabase => ({
  ...createMockDatabase(opts),
  tables,
  schemas,
});

export const createMockNormalizedSchema = ({
  database,
  tables,
  ...opts
}: Partial<NormalizedSchema> = {}): NormalizedSchema => ({
  ...createMockSchema(opts),
  database,
  tables,
});

export const createMockNormalizedTable = ({
  db,
  schema,
  fields,
  segments,
  metrics,
  ...opts
}: Partial<NormalizedTable> = {}): NormalizedTable => ({
  ...createMockTable(opts),
  db,
  schema,
  fields,
  segments,
  metrics,
});
