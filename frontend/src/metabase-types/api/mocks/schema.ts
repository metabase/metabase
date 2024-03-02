import type {
  NormalizedCollection,
  NormalizedDatabase,
  NormalizedField,
  NormalizedFieldDimension,
  NormalizedMetric,
  NormalizedSchema,
  NormalizedSegment,
  NormalizedTable,
  NormalizedTimeline,
} from "metabase-types/api";

import { createMockCollection } from "./collection";
import { createMockDatabase } from "./database";
import { createMockField, createMockFieldDimension } from "./field";
import { createMockMetric } from "./metric";
import { createMockSegment } from "./segment";
import { createMockSchema, createMockTable } from "./table";
import { createMockTimeline } from "./timeline";

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
  fks,
  segments,
  metrics,
  ...opts
}: Partial<NormalizedTable> = {}): NormalizedTable => ({
  ...createMockTable(opts),
  db,
  schema,
  fields,
  fks,
  segments,
  metrics,
});

export const createMockNormalizedFieldDimension = ({
  human_readable_field,
  ...opts
}: Partial<NormalizedFieldDimension> = {}): NormalizedFieldDimension => ({
  ...createMockFieldDimension(opts),
  human_readable_field,
});

export const createMockNormalizedField = ({
  uniqueId = "1",
  target,
  table,
  name_field,
  dimensions,
  ...opts
}: Partial<NormalizedField>): NormalizedField => ({
  ...createMockField(opts),
  uniqueId,
  target,
  table,
  name_field,
  dimensions,
});

export const createMockNormalizedSegment = ({
  table,
  ...opts
}: Partial<NormalizedSegment> = {}): NormalizedSegment => ({
  ...createMockSegment(opts),
  table,
});

export const createMockNormalizedMetric = ({
  table,
  ...opts
}: Partial<NormalizedMetric> = {}): NormalizedMetric => ({
  ...createMockMetric(opts),
  table,
});

export const createMockNormalizedTimeline = ({
  collection,
  events,
  ...opts
}: Partial<NormalizedTimeline> = {}): NormalizedTimeline => ({
  ...createMockTimeline(opts),
  collection,
  events,
});

export const createMockNormalizedCollection = ({
  items,
  ...opts
}: Partial<NormalizedCollection> = {}): NormalizedCollection => ({
  ...createMockCollection(opts),
  items,
});
