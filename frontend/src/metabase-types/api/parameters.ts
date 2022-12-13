import { Field } from "./field";

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

export interface Parameter {
  id: ParameterId;
  name: string;
  type: string;
  slug: string;
  sectionId?: string;
  default?: unknown;
  filteringParameters?: ParameterId[];
  isMultiSelect?: boolean;
  value?: unknown;
  fields?: Field[];
}
