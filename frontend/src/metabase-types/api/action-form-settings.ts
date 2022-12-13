import type Field from "metabase-lib/metadata/Field";
import type { ParameterId } from "./parameters";

export type ActionDisplayType = "form" | "button";
export type FieldType = "string" | "number" | "date" | "category";

export type DateInputType = "date" | "time" | "datetime";

// these types are saved in visualization_settings
export type InputSettingType =
  | DateInputType
  | "string"
  | "text"
  | "number"
  | "select"
  | "radio"
  | "boolean"
  | "category";

// these types get passed to the input components
export type InputComponentType =
  | "text"
  | "textarea"
  | "number"
  | "boolean"
  | "select"
  | "radio"
  | "date"
  | "time"
  | "datetime-local"
  | "category";

export type Size = "small" | "medium" | "large";

export type DateRange = [string, string];
export type NumberRange = [number, number];

export interface FieldSettings {
  id: string;
  name: string;
  title: string;
  order: number;
  description?: string | null;
  placeholder?: string;
  fieldType: FieldType;
  inputType: InputSettingType;
  required: boolean;
  defaultValue?: string | number;
  hidden: boolean;
  range?: DateRange | NumberRange;
  valueOptions?: (string | number)[];
  width?: Size;
  height?: number;
  hasSearch?: boolean;
  field?: Field;
}

export type FieldSettingsMap = Record<ParameterId, FieldSettings>;
export interface ActionFormSettings {
  name?: string;
  type: ActionDisplayType;
  description?: string;
  fields: FieldSettingsMap;
  submitButtonLabel?: string;
  submitButtonColor?: string;
  confirmMessage?: string;
  successMessage?: string;
  errorMessage?: string;
}

export type ActionFormOption = {
  name: string | number;
  value: string | number;
};

export type ActionFormFieldProps = {
  name: string;
  title: string;
  description?: string;
  placeholder?: string;
  type: InputComponentType;
  optional?: boolean;
  fieldInstance?: Field;
  options?: ActionFormOption[];
};

export type ActionFormProps = {
  fields: ActionFormFieldProps[];
};
