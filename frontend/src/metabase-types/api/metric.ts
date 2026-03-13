import type { Collection, CollectionId } from "./collection";
import type { DatasetColumn, RowValue } from "./dataset";
import type { FieldValue } from "./field";
import type { DimensionId, DimensionMapping, MetricDimension } from "./measure";

export type {
  DimensionMapping,
  MetricDimension,
  MetricDimensionGroup,
  MetricDimensionSource,
} from "./measure";

export type MetricId = number;

export type Metric = {
  id: MetricId;
  name: string;
  description: string | null;
  dimensions: MetricDimension[];
  dimension_mappings?: DimensionMapping[];
  collection_id: CollectionId | null;
  collection: Collection | null;
  result_column_name?: string;
};

export type AdhocDimension = {
  id: string;
  "field-ref": unknown;
  "display-name": string;
  "effective-type": string;
  "semantic-type"?: string;
};

export type AdhocLeafDefinition = {
  "database-id": number;
  "table-id": number;
  aggregation: unknown;
  dimensions: AdhocDimension[];
  filter?: unknown;
};

export type ExpressionRef =
  | ["metric", { "lib/uuid": string }, number]
  | ["measure", { "lib/uuid": string }, number]
  | ["adhoc", { "lib/uuid": string }, AdhocLeafDefinition];

export type InstanceFilter = {
  "lib/uuid": string;
  filter: unknown;
};

export type TypedProjection =
  | {
      type: "metric" | "measure";
      id: number;
      projection: unknown[];
    }
  | {
      type: "adhoc";
      "lib/uuid": string;
      projection: unknown[];
    };

export type JsMetricDefinition = {
  expression: ExpressionRef | unknown[];
  filters?: InstanceFilter[];
  projections?: TypedProjection[];
};

export type MetricDatasetRequest = {
  definition: JsMetricDefinition;
};

export type GetMetricDimensionValuesRequest = {
  metricId: MetricId;
  dimensionId: DimensionId;
};

export type GetMetricDimensionValuesResponse = {
  values: FieldValue[];
  has_more_values: boolean;
};

export type SearchMetricDimensionValuesRequest = {
  metricId: MetricId;
  dimensionId: DimensionId;
  query: string;
  limit: number;
};

export type MetricBreakoutValuesRequest = {
  definition: JsMetricDefinition;
};

export type MetricBreakoutValuesResponse = {
  values: RowValue[];
  col: DatasetColumn;
};

export type GetRemappedMetricDimensionValueRequest = {
  metricId: MetricId;
  dimensionId: DimensionId;
  value: string;
};
