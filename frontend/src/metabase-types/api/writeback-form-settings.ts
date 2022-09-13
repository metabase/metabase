export type FormType = "inline" | "modal";
export type FieldType = "string" | "number" | "date" | "category";

export type DateInputType = "date" | "datetime" | "monthyear" | "quarteryear";

export type InputType =
  | DateInputType
  | "string"
  | "text"
  | "number"
  | "dropdown"
  | "inline-select";

export type Size = "small" | "medium" | "large";

export type DateRange = [string, string];
export type NumberRange = [number, number];

export interface FieldSettings {
  name: string;
  order: number;
  description?: string;
  placeholder?: string;
  fieldType: FieldType;
  inputType: InputType;
  required: boolean;
  hidden: boolean;
  range?: DateRange | NumberRange;
  valueOptions?: (string | number)[];
  width?: Size;
  height?: number;
  hasSearch?: boolean;
}

export interface ActionFormSettings {
  name?: string;
  type: FormType;
  description?: string;
  fields: {
    [tagId: string]: FieldSettings;
  };
  submitButtonLabel?: string;
  confirmMessage?: string;
  successMessage?: string;
  errorMessage?: string;
}
