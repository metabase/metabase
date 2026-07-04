import type {
  MetabaseMeasuresApiMeasure,
  PostApiMeasureData,
  PutApiMeasureIdData,
} from "metabase-types/openapi";

import type { FieldValue } from "./field";
import type { DatasetQuery, OpaqueDatasetQuery } from "./query";
import type { Table, TableId } from "./table";
import type { UserInfo } from "./user";

export type MeasureId = MetabaseMeasuresApiMeasure["id"];
export type DimensionId = string;

export type MetricDimensionGroup = {
  id: string;
  type: "main" | "connection";
  display_name: string;
};

export type MetricDimensionSource = {
  type: string;
  "field-id": number;
};

export type MetricDimension = {
  id: DimensionId;
  display_name: string;
  effective_type: string;
  semantic_type: string | null;
  group?: MetricDimensionGroup;
  sources?: MetricDimensionSource[];
};

export type DimensionMappingTarget = ["field", Record<string, unknown>, number];

export type DimensionMapping = {
  dimension_id: DimensionId;
  table_id: number;
  target: DimensionMappingTarget;
};

/**
 * Overrides for fields where the backend response schema (::measure in
 * src/metabase/measures/api.clj) is weaker than the actual API response.
 * Each entry is a schema-quality finding — the goal is to shrink this list
 * by tightening the Malli schemas, then deleting the override.
 *
 * NOTE: response schemas are runtime-validated against pre-JSON-encoded data
 * (java.time objects, not strings), so `created_at`/`updated_at` need a
 * temporal-schema convention on the backend before they can be tightened.
 */
type MeasureSchemaGaps = {
  created_at: string; // BE: [:created_at :any]
  updated_at: string; // BE: [:updated_at :any]
  creator?: UserInfo; // BE: loose [:maybe :map]
  definition: OpaqueDatasetQuery; // BE: ms/Map
  dimensions?: MetricDimension[]; // BE: loose maps
  dimension_mappings?: DimensionMapping[]; // BE: loose maps
  table_id: TableId; // BE: ms/PositiveInt, FE: virtual table ids are strings
  // Returned by the API (hydration) but missing from the response schema entirely:
  table?: Table;
  definition_description?: string;
  revision_message?: string;
};

export type Measure = Omit<
  MetabaseMeasuresApiMeasure,
  keyof MeasureSchemaGaps
> &
  MeasureSchemaGaps;

type CreateMeasureBody = NonNullable<PostApiMeasureData["body"]>;

export type CreateMeasureRequest = Omit<
  CreateMeasureBody,
  "definition" | "table_id"
> & {
  definition: DatasetQuery; // BE request schema: ms/Map
  table_id: TableId; // BE: ms/PositiveInt, FE: virtual table ids are strings
};

type UpdateMeasureBody = NonNullable<PutApiMeasureIdData["body"]>;

export type UpdateMeasureRequest = Omit<UpdateMeasureBody, "definition"> & {
  id: MeasureId; // RTK arg shape: id travels in the URL path
  definition?: DatasetQuery; // BE request schema: [:maybe ms/Map]
};

export type GetMeasureDimensionValuesRequest = {
  measureId: MeasureId;
  dimensionId: DimensionId;
};

export type GetMeasureDimensionValuesResponse = {
  values: FieldValue[];
  has_more_values: boolean;
};

export type SearchMeasureDimensionValuesRequest = {
  measureId: MeasureId;
  dimensionId: DimensionId;
  query: string;
  limit: number;
};

export type GetRemappedMeasureDimensionValueRequest = {
  measureId: MeasureId;
  dimensionId: DimensionId;
  value: string;
};
