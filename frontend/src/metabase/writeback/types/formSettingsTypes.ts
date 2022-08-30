export type FormType = "inline" | "modal";
export type FieldType = "text" | "number" | "date" | "category";
export type InputType =
  | "text"
  | "longtext"
  | "number"
  | "date"
  | "datetime"
  | "monthyear"
  | "quarteryear"
  | "dropdown"
  | "inline-select";
export type Size = "sm" | "md" | "lg";

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
  search?: boolean;
}

export interface ActionFormSettings {
  name?: string;
  type: FormType;
  description?: string;
  fields: {
    [tagId: string]: FieldSettings;
  };
  confirmMessage?: string;
  successMessage?: string;
  errorMessage?: string;
  // successAction ?
}
