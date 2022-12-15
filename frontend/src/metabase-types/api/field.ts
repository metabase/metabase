import { RowValue } from "./dataset";
import { TableId } from "./table";

export type FieldId = number;

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
  earliest: "2016-04-26T19:29:55.147Z";
  latest: "2019-04-15T13:34:19.931Z";
};

export interface FieldFingerprint {
  global: {
    "distinct-count"?: number;
    "nil%": number;
  };
  type?: {
    "type/Text"?: TextFieldFingerprint;
    "type/Number"?: NumberFieldFingerprint;
    "type/DateTime"?: DateTimeFieldFingerprint;
  };
}

export type FieldVisibilityType =
  | "details-only"
  | "hidden"
  | "normal"
  | "retired";

type HumanReadableFieldValue = string;
type FieldValue = [RowValue] | [RowValue, HumanReadableFieldValue];

export type FieldDimension = {
  name: string;
};

export interface Field {
  id?: FieldId;
  table_id: TableId;

  name: string;
  display_name: string;
  description: string | null;

  base_type: string;
  effective_type?: string;
  semantic_type: string;

  active: boolean;
  visibility_type: FieldVisibilityType;
  preview_display: boolean;
  position: number;

  parent_id?: FieldId;
  fk_target_field_id?: FieldId;
  values?: FieldValue[];
  dimensions?: FieldDimension;

  max_value?: number;
  min_value?: number;

  caveats?: string | null;
  points_of_interest?: string;

  nfc_path: string[] | null;
  fingerprint?: FieldFingerprint;

  last_analyzed: string;
  created_at: string;
  updated_at: string;
}
