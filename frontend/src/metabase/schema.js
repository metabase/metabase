// normalizr schema for use in actions/reducers

import { schema } from "normalizr";

export const QuestionSchema = new schema.Entity("questions");
export const DashboardSchema = new schema.Entity("dashboards");
export const PulseSchema = new schema.Entity("pulses");
export const CollectionSchema = new schema.Entity("collections");

export const DatabaseSchema = new schema.Entity("databases");
export const TableSchema = new schema.Entity("tables");
export const FieldSchema = new schema.Entity("fields");
export const SegmentSchema = new schema.Entity("segments");
export const MetricSchema = new schema.Entity("metrics");

DatabaseSchema.define({
  tables: [TableSchema],
});

TableSchema.define({
  db: DatabaseSchema,
  fields: [FieldSchema],
  segments: [SegmentSchema],
  metrics: [MetricSchema],
});

FieldSchema.define({
  target: FieldSchema,
  table: TableSchema,
  name_field: FieldSchema,
  dimensions: {
    human_readable_field: FieldSchema,
  },
});

SegmentSchema.define({
  table: TableSchema,
});

MetricSchema.define({
  table: TableSchema,
});

CollectionSchema.define({
  cards: [QuestionSchema],
  dashboards: [DashboardSchema],
  pulses: [PulseSchema],
});
