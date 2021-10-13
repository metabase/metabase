// Legacy "tableMetadata" etc

import type { Database, DatabaseId } from "metabase-types/types/Database";
import type { Table, TableId } from "metabase-types/types/Table";
import type { Field, FieldId } from "metabase-types/types/Field";
import type { Segment, SegmentId } from "metabase-types/types/Segment";
import type { Metric, MetricId } from "metabase-types/types/Metric";

export type Metadata = {
  databases: { [id in DatabaseId]: DatabaseMetadata },
  tables: { [id in TableId]: TableMetadata },
  fields: { [id in FieldId]: FieldMetadata },
  metrics: { [id in MetricId]: MetricMetadata },
  segments: { [id in SegmentId]: SegmentMetadata },
};

export type DatabaseMetadata = Database & {
  tables: TableMetadata[],
  tables_lookup: { [id in TableId]: TableMetadata },
};

export type TableMetadata = Table & {
  db: DatabaseMetadata,

  fields: FieldMetadata[],
  fields_lookup: { [id in FieldId]: FieldMetadata },

  segments: SegmentMetadata[],
  metrics: MetricMetadata[],

  aggregation_operators: AggregationOperator[],
};

export type FieldMetadata = Field & {
  table: TableMetadata,
  target: FieldMetadata,

  filter_operators: FilterOperator[],
  filter_operators_lookup: { [key in FilterOperatorName]: FilterOperator },
};

export type SegmentMetadata = Segment & {
  table: TableMetadata,
};

export type MetricMetadata = Metric & {
  table: TableMetadata,
};

export type FieldValue = {
  name: string,
  key: string,
};

export type FilterOperatorName = string;

export type FilterOperator = {
  name: FilterOperatorName,
  verboseName: string,
  moreVerboseName: string,
  fields: FilterOperatorField[],
  multi: boolean,
  placeholders?: string[],
  validArgumentsFilters: ValidArgumentsFilter[],
};

export type FilterOperatorField = {
  type: string,
  values: FieldValue[],
};

export type ValidArgumentsFilter = (field: Field, table: Table) => boolean;

type FieldsFilter = (fields: Field[]) => Field[];

export type AggregationOperator = {
  name: string,
  short: string,
  fields: Field[],
  validFieldsFilters: FieldsFilter[],
};

export type FieldOptions = {
  count: number,
  fields: Field[],
  fks: {
    field: Field,
    fields: Field[],
  },
};

import Dimension from "metabase-lib/lib/Dimension";

export type DimensionOptions = {
  count: number,
  dimensions: Dimension[],
  fks: Array<{
    field: FieldMetadata,
    dimensions: Dimension[],
  }>,
};
