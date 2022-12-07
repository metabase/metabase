import type { Validator, FormFieldDefinition } from "metabase-types/forms";
import type Field from "metabase-lib/metadata/Field";
import type { ParameterId } from "./parameters";

export type ActionDisplayType = "form" | "button";
export type FieldType = "string" | "number" | "date" | "category";

export type DateInputType = "date" | "time" | "datetime";

export type InputType =
  | DateInputType
  | "string"
  | "text"
  | "number"
  | "select"
  | "radio"
  | "boolean"
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
  inputType: InputType;
  required: boolean;
  defaultValue?: string | number;
  hidden: boolean;
  range?: DateRange | NumberRange;
  valueOptions?: (string | number)[];
  width?: Size;
  height?: number;
  hasSearch?: boolean;
  fieldInstance?: Field;
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

export type ActionFormFieldProps = FormFieldDefinition & {
  validator?: Validator;
  fieldInstance?: Field;
};

export type ActionFormProps = {
  fields: ActionFormFieldProps[];
};
