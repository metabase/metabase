import type { Metabase_Lib_Schema_Metadata_ColumnVisibilityType } from "cljs/metabase.lib.js";
import type { RowValue } from "./dataset";
import type { DimensionReference, FieldReference } from "./query";
import type { Table, TableId } from "./table";

export type FieldId = number;

export interface FieldFingerprint {
  global?: FieldGlobalFingerprint;
  type?: FieldTypeFingerprint;
}

export interface FieldGlobalFingerprint {
  "distinct-count"?: number;
  "nil%"?: number;
}

export interface FieldTypeFingerprint {
  "type/Text"?: TextFieldFingerprint;
  "type/Number"?: NumberFieldFingerprint;
  "type/DateTime"?: DateTimeFieldFingerprint;
}

export type TextFieldFingerprint = {
  "average-length": number;
  "percent-email": number;
  "percent-json": number;
  "percent-state": number;
  "percent-url": number;
};

export type NumberFieldFingerprint = {
  avg: number;
  max: number;
  min: number;
  q1: number;
  q3: number;
  sd: number;
};

export type DateTimeFieldFingerprint = {
  earliest: string;
  latest: string;
};

// Using the generated type from CLJS schema
export type FieldVisibilityType = Metabase_Lib_Schema_Metadata_ColumnVisibilityType;

type HumanReadableFieldValue = string;
export type RemappedFieldValue = [RowValue, HumanReadableFieldValue];
export type NotRemappedFieldValue = [RowValue];
export type FieldValue = NotRemappedFieldValue | RemappedFieldValue;

export type FieldValuesType = "list" | "search" | "none";

export type FieldDimensionType = "internal" | "external";

export type FieldDimension = {
  id: number;
  type: FieldDimensionType;
  name: string;
  human_readable_field_id?: FieldId;
  human_readable_field?: Field;
};

export interface Field {
  id: FieldId | FieldReference;
  table_id: TableId;
  table?: Table;
  field_ref?: DimensionReference;

  name: string;
  display_name: string;
  description: string | null;

  database_type: string;
  base_type: string;
  effective_type?: string;
  semantic_type: string | null;

  active: boolean;
  visibility_type: FieldVisibilityType;
  preview_display: boolean;
  position: number;

  parent_id?: FieldId | null;
  fk_target_field_id: FieldId | null;
  target?: Field;
  values?: FieldValue[];
  remappings?: FieldValue[];
  settings?: FieldFormattingSettings;

  dimensions?: FieldDimension[];
  name_field?: Field;

  max_value?: number;
  min_value?: number;
  has_field_values: FieldValuesType;
  has_more_values?: boolean;

  caveats?: string | null;
  points_of_interest?: string;

  nfc_path: string[] | null;
  json_unfolding: boolean | null;
  coercion_strategy: string | null;
  fingerprint: FieldFingerprint | null;

  last_analyzed: string;
  created_at: string;
  updated_at: string;
}

export interface FieldFormattingSettings {
  currency?: string;
  number_separators?: string;
}

export interface GetFieldRequest {
  id: FieldId;
  include_editable_data_model?: boolean;
}

export interface UpdateFieldRequest {
  id: FieldId;
  caveats?: string | null;
  description?: string | null;
  display_name?: string;
  fk_target_field_id?: FieldId | null;
  points_of_interest?: string;
  semantic_type?: string | null;
  coercion_strategy?: string | null;
  visibility_type?: FieldVisibilityType;
  has_field_values?: FieldValuesType;
  settings?: FieldFormattingSettings;
  nfc_path?: string[] | null;
  json_unfolding?: boolean | null;
}

export interface GetFieldValuesResponse {
  field_id: FieldId;
  values: FieldValue[];
  has_more_values: boolean;
}

export interface SearchFieldValuesRequest {
  fieldId: FieldId;
  searchFieldId: FieldId;
  value?: string;
  limit: number;
}

export interface GetRemappedFieldValueRequest {
  fieldId: FieldId;
  remappedFieldId: FieldId;
  value: string;
}

export interface CreateFieldDimensionRequest {
  id: FieldId;
  type: FieldDimensionType;
  name: string;
  human_readable_field_id?: FieldId | null;
}

export interface UpdateFieldValuesRequest {
  id: FieldId;
  values: FieldValue[];
}
