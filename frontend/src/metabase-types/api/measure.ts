import type { DatasetQuery } from "./query";
import type { Table, TableId } from "./table";
import type { UserInfo } from "./user";

export type MeasureId = number;
export type DimensionId = string;

export interface Measure {
  id: MeasureId;
  name: string;
  description: string | null;
  table_id: TableId;
  table?: Table;
  archived: boolean;
  definition: DatasetQuery;
  definition_description?: string;
  revision_message?: string;
  created_at: string;
  creator_id: number;
  creator?: UserInfo;
  updated_at: string;
}

export interface CreateMeasureRequest {
  name: string;
  table_id: TableId;
  definition: DatasetQuery;
  description?: string;
}

export interface UpdateMeasureRequest {
  id: MeasureId;
  name?: string;
  definition?: DatasetQuery;
  revision_message: string;
  archived?: boolean;
  description?: string;
}

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
