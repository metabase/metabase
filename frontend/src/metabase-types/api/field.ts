import { RowValue } from "./dataset";
import { Table, TableId } from "./table";
import type { FieldReference } from "./query";

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

export type FieldVisibilityType =
  | "details-only"
  | "hidden"
  | "normal"
  | "retired"
  | "sensitive";

type HumanReadableFieldValue = string;
export type FieldValue = [RowValue] | [RowValue, HumanReadableFieldValue];

export type FieldValuesType = "list" | "search" | "none";

export type FieldDimension = {
  name: string;
};

export type FieldDimensionOption = {
  name: string;
  mbql: unknown[] | null;
  type: string;
};

export interface ConcreteField {
  id: FieldId;
  table_id: TableId;
  table?: Table;

  name: string;
  display_name: string;
  description: string | null;

  base_type: string;
  effective_type?: string;
  semantic_type: string | null;

  active: boolean;
  visibility_type: FieldVisibilityType;
  preview_display: boolean;
  position: number;

  parent_id?: FieldId;
  fk_target_field_id: FieldId | null;
  target?: Field;
  values?: FieldValue[];
  settings?: FieldFormattingSettings;

  dimensions?: FieldDimension[];
  default_dimension_option?: FieldDimensionOption;
  dimension_options?: FieldDimensionOption[];

  max_value?: number;
  min_value?: number;
  has_field_values: FieldValuesType;

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

export interface FieldValues {
  field_id: FieldId;
  values: FieldValue[];
  has_more_values: boolean;
}

export type Field = Omit<ConcreteField, "id"> & {
  id?: FieldId;
  field_ref?: FieldReference;
};

export interface FieldFormattingSettings {
  currency?: string;
}
