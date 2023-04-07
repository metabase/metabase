import { RowValue } from "./dataset";
import { CardId } from "./card";

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
  | "date/quarter-year";
("date/all-options");

export type ParameterType =
  | StringParameterType
  | NumberParameterType
  | DateParameterType;

export type ParameterId = string;

export type ActionParameterValue = string | number;

export interface Parameter extends ParameterValuesConfig {
  id: ParameterId;
  name: string;
  "display-name"?: string;
  type: string;
  slug: string;
  sectionId?: string;
  default?: any;
  required?: boolean;
  filteringParameters?: ParameterId[];
  isMultiSelect?: boolean;
  value?: any;
  options?: ParameterOptions;
}

export interface ParameterOptions {
  "case-sensitive"?: boolean;
}

export interface ParameterValuesConfig {
  values_query_type?: ValuesQueryType;
  values_source_type?: ValuesSourceType;
  values_source_config?: ValuesSourceConfig;
}

export type ValuesQueryType = "list" | "search" | "none";

export type ValuesSourceType = null | "card" | "static-list";

export interface ValuesSourceConfig {
  values?: string[];
  card_id?: CardId;
  value_field?: unknown[];
}

export type ParameterValue = [RowValue];

export interface ParameterValues {
  values: ParameterValue[];
  has_more_values: boolean;
}
