import type { CardId } from "./card";
import type { RowValue, TemporalUnit } from "./dataset";
import type { ConcreteFieldReference, ExpressionReference } from "./query";

export type StringParameterType =
  | "string/="
  | "string/!="
  | "string/contains"
  | "string/does-not-contain"
  | "string/starts-with"
  | "string/ends-with";

export type NumberParameterType =
  | "number/="
  | "number/!="
  | "number/between"
  | "number/>="
  | "number/<=";

export type DateParameterType =
  | "date/single"
  | "date/range"
  | "date/relative"
  | "date/month-year"
  | "date/quarter-year"
  | "date/all-options";

export type ParameterType =
  | StringParameterType
  | NumberParameterType
  | DateParameterType
  | "id"
  | "category"
  | "temporal-unit";

export type ParameterId = string;

export type ActionParameterValue = string | number | boolean;

export interface Parameter extends ParameterValuesConfig {
  id: ParameterId;
  name: string;
  "display-name"?: string;
  type: string;
  slug: string;
  sectionId?: string;
  default?: any;
  required?: boolean;
  options?: ParameterOptions;
  filteringParameters?: ParameterId[];
  isMultiSelect?: boolean;
  value?: any;
  target?: ParameterTarget;
  temporal_units?: TemporalUnit[];
}

export interface ParameterValuesConfig {
  values_query_type?: ValuesQueryType;
  values_source_type?: ValuesSourceType;
  values_source_config?: ValuesSourceConfig;
}

export type ValuesQueryType = "list" | "search" | "none";

export type ValuesSourceType = null | "card" | "static-list";

export interface ValuesSourceConfig {
  values?: string[] | ParameterValue[];
  card_id?: CardId;
  value_field?: unknown[];
}

export type VariableTarget = ["template-tag", string];
export type ParameterVariableTarget = ["variable", VariableTarget];
export type ParameterTextTarget = ["text-tag", string];

export type ParameterTarget =
  | ParameterVariableTarget
  | ParameterDimensionTarget
  | ParameterTextTarget;

export type ParameterDimensionTarget =
  | NativeParameterDimensionTarget
  | StructuredParameterDimensionTarget;

export type DimensionTargetOptions = {
  "stage-number"?: number;
};

export type NativeParameterDimensionTarget =
  | ["dimension", VariableTarget]
  | ["dimension", VariableTarget, DimensionTargetOptions];

export type StructuredParameterDimensionTarget =
  | ["dimension", ConcreteFieldReference | ExpressionReference]
  | [
      "dimension",
      ConcreteFieldReference | ExpressionReference,
      DimensionTargetOptions,
    ];

export type ParameterValueOrArray =
  | string
  | number
  | boolean
  | Array<string | number | boolean>;

export type HumanReadableParameterValue = string;
export type NotRemappedParameterValue = [RowValue];
export type RemappedParameterValue = [RowValue, HumanReadableParameterValue];
export type ParameterValue = NotRemappedParameterValue | RemappedParameterValue;

export type ParameterValuesMap = Record<
  ParameterId,
  ParameterValueOrArray | null
>;

export interface ParameterValues {
  values: ParameterValue[];
  has_more_values: boolean;
}

export interface ParameterOptions {
  "case-sensitive": boolean;
}

export type ParameterMappingOptions = {
  name: string;
  sectionId: string;
  combinedName?: string;
  menuName?: string;
  type: string;
};

export type ParameterQueryObject = {
  type: string;
  target: ParameterTarget;
  value: ParameterValueOrArray;
};

export type NormalizedParameter = {
  id: ParameterId;
  name: string;
  slug: string;
  type: string;
  target?: ParameterTarget;
  options?: ParameterOptions;
  values_query_type?: ValuesQueryType;
  values_source_type?: ValuesSourceType;
  values_source_config?: ValuesSourceConfig;
};

export type GetParameterValuesRequest = {
  parameter: NormalizedParameter;
  field_ids: number[];
};

export type SearchParameterValuesRequest = {
  parameter: Parameter;
  field_ids: number[];
  query: string;
};
