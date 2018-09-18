/* @flow */

import type { ISO8601Time } from ".";
import type { TableId } from "./Table";
import type { Value } from "./Dataset";

export type FieldId = number;

export type BaseType = string;
export type SpecialType = string;

export type FieldVisibilityType =
  | "details-only"
  | "hidden"
  | "normal"
  | "retired";

export type Field = {
  id: FieldId,

  name: string,
  display_name: string,
  description: string,
  base_type: BaseType,
  special_type: SpecialType,
  active: boolean,
  visibility_type: FieldVisibilityType,
  preview_display: boolean,
  position: number,
  parent_id: ?FieldId,

  table_id: TableId,

  fk_target_field_id: ?FieldId,

  max_value: ?number,
  min_value: ?number,

  caveats: ?string,
  points_of_interest: ?string,

  last_analyzed: ISO8601Time,
  created_at: ISO8601Time,
  updated_at: ISO8601Time,

  values?: FieldValues,
  dimensions?: FieldDimension,
};

export type RawFieldValue = Value;
export type HumanReadableFieldValue = string;

export type FieldValue =
  | [RawFieldValue]
  | [RawFieldValue, HumanReadableFieldValue];
export type FieldValues = FieldValue[];

export type FieldDimension = {
  name: string,
};
